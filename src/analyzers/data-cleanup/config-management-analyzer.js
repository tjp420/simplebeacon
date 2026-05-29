/**
 * Detect configuration sprawl and duplicate config files.
 */

const fs = require('fs');
const { parseEnvFile } = require('./utils/env-parser');
const { filterWorkspaceFiles } = require('./utils/workspace-path-utils');
const { resolveEnvProfileGroup, shouldSkipEnvInconsistency } = require('./utils/env-profile-utils');

const CONFIG_PATTERNS = [
    { id: 'env-file', match: (name) => /^\.env/i.test(name), label: 'Environment file' },
    { id: 'package-json', match: (name) => name === 'package.json', label: 'Package manifest' },
    { id: 'bundler-config', match: (name) => /^(webpack|vite|rollup|esbuild|parcel)\.config\./i.test(name), label: 'Bundler config' },
    { id: 'test-config', match: (name) => /^(jest|vitest|playwright|cypress)\.config\./i.test(name) || name === 'jest.config.js', label: 'Test runner config' },
    { id: 'ts-config', match: (name) => /^tsconfig.*\.json$/i.test(name), label: 'TypeScript config' }
];

class ConfigManagementAnalyzer {
    async scan(projectRoot, options = {}) {
        const inventory = options.inventory;
        const configFiles = filterWorkspaceFiles(
            inventory.files.filter((file) =>
                CONFIG_PATTERNS.some((pattern) => pattern.match(file.name))
            )
        );

        const findings = [];
        const byCategory = new Map();

        for (const file of configFiles) {
            const pattern = CONFIG_PATTERNS.find((entry) => entry.match(file.name));
            const bucket = byCategory.get(pattern.id) || [];
            bucket.push(file);
            byCategory.set(pattern.id, bucket);
        }

        const envFiles = byCategory.get('env-file') || [];
        const operationalEnvFiles = envFiles.filter(
            (file) => !/\.example|\.template|\.sample|env-sample|env_example/i.test(file.name)
        );
        if (operationalEnvFiles.length > 3) {
            findings.push({
                type: 'config-sprawl',
                path: operationalEnvFiles[0].relativePath,
                reason: `${operationalEnvFiles.length} environment files detected — consider consolidating secrets`,
                severity: 'medium',
                confidence: 'medium',
                action: 'review-config-sprawl',
                metadata: { files: operationalEnvFiles.map((file) => file.relativePath) }
            });
        }

        for (const [category, files] of byCategory.entries()) {
            if (category === 'env-file' || category === 'package-json') continue;
            if (files.length <= 1) continue;
            findings.push({
                type: 'duplicate-config-type',
                path: files[0].relativePath,
                reason: `${files.length} ${CONFIG_PATTERNS.find((p) => p.id === category)?.label || category} files`,
                severity: 'low',
                confidence: 'high',
                action: 'consolidate-configs',
                metadata: { files: files.map((file) => file.relativePath) }
            });
        }

        const packageJsons = byCategory.get('package-json') || [];
        if (packageJsons.length > 5) {
            findings.push({
                type: 'config-sprawl',
                path: packageJsons[0].relativePath,
                reason: `${packageJsons.length} package.json files — verify workspace layout is intentional`,
                severity: 'low',
                confidence: 'medium',
                action: 'review-workspace-layout',
                metadata: { files: packageJsons.map((file) => file.relativePath) }
            });
        }

        const envInconsistencies = this.findEnvInconsistencies(envFiles);
        findings.push(...envInconsistencies);

        findings.push(...this.detectUnusedConfigs(configFiles, inventory));

        const obsoleteCandidates = configFiles.filter((file) =>
            /\.(original|backup|bak|old)\./i.test(file.name)
        );
        for (const file of obsoleteCandidates) {
            findings.push({
                type: 'obsolete-config',
                path: file.relativePath,
                reason: 'Backup or legacy config filename pattern',
                severity: 'low',
                confidence: 'high',
                action: 'archive-or-delete',
                metadata: {}
            });
        }

        return {
            scanner: 'config-management',
            findings,
            summary: {
                configFiles: configFiles.length,
                envFiles: envFiles.length,
                packageJsonFiles: packageJsons.length,
                sprawlFindings: findings.filter((f) => f.type === 'config-sprawl').length,
                duplicateConfigTypes: findings.filter((f) => f.type === 'duplicate-config-type').length,
                inconsistentEnvKeys: findings.filter((f) => f.type === 'env-inconsistency').length,
                unusedConfigs: findings.filter((f) => f.type === 'unused-config').length
            }
        };
    }

    isRootConfig(relativePath) {
        const rel = String(relativePath || '').replace(/\\/g, '/');
        const base = rel.split('/').pop();
        return base === 'package.json'
            || base === '.env'
            || base === '.env.example'
            || /^tsconfig(\..+)?\.json$/i.test(base)
            || /^jest\.config\.(js|mjs|cjs|ts)$/i.test(base);
    }

    detectConfigReferences(content, configPath) {
        const relForward = String(configPath || '').replace(/\\/g, '/');
        const relBackslash = relForward.replace(/\//g, '\\');
        const base = relForward.split('/').pop();
        return content.includes(relForward)
            || content.includes(relBackslash)
            || (base && content.includes(base));
    }

    detectUnusedConfigs(configFiles, inventory) {
        const findings = [];
        const sourceFiles = inventory.files.filter((file) =>
            /\.(js|mjs|cjs|ts|tsx|jsx|json|yml|yaml|md|html)$/i.test(file.name)
        );

        for (const config of configFiles) {
            if (this.isRootConfig(config.relativePath)) continue;
            if (/\.example|\.template|\.sample/i.test(config.name)) continue;

            let referenced = false;
            for (const source of sourceFiles) {
                if (source.path === config.path) continue;
                let content = '';
                try {
                    content = fs.readFileSync(source.path, 'utf8');
                } catch {
                    continue;
                }
                if (this.detectConfigReferences(content, config.relativePath)) {
                    referenced = true;
                    break;
                }
            }

            if (!referenced) {
                findings.push({
                    type: 'unused-config',
                    path: config.relativePath,
                    reason: 'Config file is not referenced by any scanned source or config file',
                    severity: 'low',
                    confidence: 'medium',
                    action: 'remove-or-archive',
                    metadata: {
                        configType: CONFIG_PATTERNS.find((entry) => entry.match(config.name))?.id || 'unknown'
                    }
                });
            }
        }

        return findings;
    }

    findEnvInconsistencies(envFiles) {
        const keyValues = new Map();
        const findings = [];

        for (const file of envFiles) {
            let content = '';
            try {
                content = fs.readFileSync(file.path, 'utf8');
            } catch {
                continue;
            }
            const profileGroup = resolveEnvProfileGroup(file.relativePath);
            const entries = parseEnvFile(content);
            for (const [key, meta] of entries.entries()) {
                const bucketKey = `${profileGroup}::${key}`;
                const bucket = keyValues.get(bucketKey) || [];
                bucket.push({ file: file.relativePath, value: meta.value });
                keyValues.set(bucketKey, bucket);
            }
        }

        for (const [bucketKey, values] of keyValues.entries()) {
            const key = bucketKey.split('::').slice(1).join('::');
            const unique = [...new Set(values.map((entry) => entry.value))];
            if (unique.length <= 1 || values.length <= 1) continue;
            if (shouldSkipEnvInconsistency(key, values)) continue;
            findings.push({
                type: 'env-inconsistency',
                path: values[0].file,
                reason: `Environment key ${key} has ${unique.length} different values across env files`,
                severity: 'medium',
                confidence: 'high',
                action: 'align-env-values',
                metadata: { key, values }
            });
        }

        return findings;
    }
}

module.exports = {
    ConfigManagementAnalyzer
};
