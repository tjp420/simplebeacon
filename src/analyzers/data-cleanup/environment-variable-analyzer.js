/**
 * Analyze .env files for secrets, drift, and unused keys.
 */

const fs = require('fs');
const { scanTextContent } = require('../../lib/credential-pattern-scanner');
const { parseEnvFile } = require('./utils/env-parser');
const { filterWorkspaceFiles } = require('./utils/workspace-path-utils');
const {
    resolveEnvProfileGroup,
    shouldSkipEnvInconsistency,
    isPhase2ExampleEnvFile,
    isPlannedEnvKey,
    isRuntimeInjectedEnvKey,
    isNonProductionSourcePath
} = require('./utils/env-profile-utils');

const ENV_REFERENCE_PATTERN = /process\.env\.([A-Z0-9_]+)/g;
const ENV_GETTER_PATTERN = /\bget\s*\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g;
const ENV_CREDENTIAL_PATTERN = /resolveCredential\([^,]+,\s*[^,]+,\s*['"]([A-Z0-9_]+)['"]\s*\)/g;

function collectEnvReferences(content, filePath, referencedKeys) {
    const patterns = [ENV_REFERENCE_PATTERN, ENV_GETTER_PATTERN, ENV_CREDENTIAL_PATTERN];
    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match = pattern.exec(content);
        while (match) {
            const key = match[1];
            const refs = referencedKeys.get(key) || new Set();
            refs.add(filePath);
            referencedKeys.set(key, refs);
            match = pattern.exec(content);
        }
    }
}

class EnvironmentVariableAnalyzer {
    async scan(projectRoot, options = {}) {
        const inventory = options.inventory;
        const envFiles = filterWorkspaceFiles(
            inventory.files.filter((file) => /^\.env/i.test(file.name))
        );
        const sourceFiles = filterWorkspaceFiles(
            inventory.files.filter((file) =>
                ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'].includes(file.ext)
            )
        );

        const findings = [];
        const envKeys = new Map();
        const referencedKeys = new Map();

        for (const file of envFiles) {
            let content = '';
            try {
                content = fs.readFileSync(file.path, 'utf8');
            } catch {
                continue;
            }

            for (const hit of scanTextContent(file.relativePath, content)) {
                findings.push({
                    type: 'env-secret',
                    path: file.relativePath,
                    reason: `Potential secret pattern (${hit.pattern}) in environment file`,
                    severity: hit.severityBand === 'critical' ? 'high' : 'medium',
                    confidence: 'high',
                    action: 'rotate-and-move-to-secret-store',
                    metadata: { line: hit.line, pattern: hit.pattern }
                });
            }

            const profileGroup = resolveEnvProfileGroup(file.relativePath);
            for (const [key, meta] of parseEnvFile(content).entries()) {
                const bucketKey = `${profileGroup}::${key}`;
                const bucket = envKeys.get(bucketKey) || [];
                bucket.push({ file: file.relativePath, value: meta.value, line: meta.line, key });
                envKeys.set(bucketKey, bucket);
            }
        }

        for (const file of sourceFiles.slice(0, 2000)) {
            let content = '';
            try {
                content = fs.readFileSync(file.path, 'utf8');
            } catch {
                continue;
            }
            collectEnvReferences(content, file.relativePath, referencedKeys);
        }

        for (const [, values] of envKeys.entries()) {
            const uniqueValues = [...new Set(values.map((entry) => entry.value))];
            if (uniqueValues.length <= 1) continue;
            const key = values[0].key;
            if (shouldSkipEnvInconsistency(key, values)) continue;
            findings.push({
                type: 'env-inconsistency',
                path: values[0].file,
                reason: `Environment variable ${key} differs across env files`,
                severity: 'medium',
                confidence: 'high',
                action: 'align-env-values',
                metadata: { key, values }
            });
        }

        for (const [key, refs] of referencedKeys.entries()) {
            if (isRuntimeInjectedEnvKey(key)) continue;
            if (isPlannedEnvKey(key)) continue;
            const productionRefs = [...refs].filter((ref) => !isNonProductionSourcePath(ref));
            if (!productionRefs.length) continue;
            const defined = [...envKeys.keys()].some((bucketKey) => bucketKey.endsWith(`::${key}`));
            if (defined) continue;
            findings.push({
                type: 'missing-env-key',
                path: '.env',
                reason: `Code references process.env.${key} but no env file defines it`,
                severity: 'medium',
                confidence: 'medium',
                action: 'document-or-add-env-key',
                metadata: { key, references: productionRefs.slice(0, 8) }
            });
        }

        const definedKeys = new Set(
            [...envKeys.values()].flatMap((values) => values.map((entry) => entry.key))
        );
        for (const key of definedKeys) {
            if (referencedKeys.has(key)) continue;
            if (/^(NODE_ENV|PORT|HOST|CI|DEBUG)$/i.test(key)) continue;
            if (isPlannedEnvKey(key)) continue;
            const bucketKey = [...envKeys.keys()].find((candidate) => candidate.endsWith(`::${key}`));
            if (!bucketKey) continue;
            const sample = envKeys.get(bucketKey);
            if (!sample) continue;
            if (sample.every((entry) => isPhase2ExampleEnvFile(entry.file))) continue;
            findings.push({
                type: 'unused-env-key',
                path: sample[0].file,
                reason: `Environment variable ${key} is defined but not referenced in scanned source`,
                severity: 'low',
                confidence: 'medium',
                action: 'remove-or-document',
                metadata: { key, files: sample.map((entry) => entry.file) }
            });
        }

        return {
            scanner: 'environment-variables',
            findings,
            summary: {
                envFiles: envFiles.length,
                envKeys: envKeys.size,
                referencedKeys: referencedKeys.size,
                secretFindings: findings.filter((f) => f.type === 'env-secret').length,
                missingKeys: findings.filter((f) => f.type === 'missing-env-key').length,
                unusedKeys: findings.filter((f) => f.type === 'unused-env-key').length
            }
        };
    }
}

module.exports = {
    EnvironmentVariableAnalyzer
};
