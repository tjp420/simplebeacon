/**
 * LLM slop / placeholder detection (SB-FICTION-001–004).
 * Line-based regex scan on source, config, and UI layers — complements fiction-kpi-patterns.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { globMatch } = require('./production-leak');

const DEFAULT_SOURCE_PATHS = ['server', 'src', 'web', 'lib', 'packages', 'app'];
const MANIFEST_NAMES = new Set(['package.json', 'package-lock.json']);
const SCANNABLE_EXTENSIONS = new Set([
    '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.html', '.vue', '.svelte', '.json', '.env', '.yaml', '.yml'
]);
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'coverage', 'dist', 'build', 'archive',
    '.simplebeacon', 'tests', 'test', '__tests__', 'fixtures', 'docs', 'deliverables'
]);
const MAX_SCAN_BYTES = 512000;

// Split so the rule source does not match its own lorem-ipsum detector pattern.
const LOREM_IPSUM_SLOP = 'Lorem' + '\\s+' + 'Ipsum' + '\\s+Dolor';

const RULE_CATALOG = [
    {
        id: 'SB-FICTION-001',
        regex: /(?:YOUR_[A-Z0-9_]+_HERE|INSERT_[A-Z0-9_]+_HERE|\[Insert\s[^\]]+\]|\/\/\s*Handle\s+this\s+later|\/\/\s*AI\s+Generated\s+Placeholder)/gi,
        severity: 'high',
        description: 'Unresolved LLM placeholder or conversational debris'
    },
    {
        id: 'SB-FICTION-002',
        regex: /(```javascript|```typescript|```python|```json|```\s?$)/gm,
        severity: 'high',
        description: 'Raw markdown code fence leaked into source/config'
    },
    {
        id: 'SB-FICTION-004',
        regex: new RegExp(`(?:99\\.99\\s*%\\s*Uptime|100\\s*%\\s*Secure|${LOREM_IPSUM_SLOP}|9,999\\s*Users)`, 'gi'),
        severity: 'medium',
        description: 'Hardcoded AI-default UI metric or placeholder Latin filler copy'
    }
];

const SUSPICIOUS_DEP_NAME = /^(fake-|mock-|test-api-package)/i;

const ALLOWLIST_SNIPPETS = [
    'your-api-key-here',
    'your_secret',
    'placeholder',
    'example.com',
    'llm-slop-patterns.js',
    'fiction-kpi-patterns.js',
    'rule_definitions',
    'not model output',
    'baseline false'
];

function normalizeRel(baseDir, filePath) {
    return path.relative(baseDir, filePath).split(path.sep).join('/');
}

function isIgnored(relativePath, ignoreGlobs) {
    return (ignoreGlobs || []).some((pattern) => globMatch(relativePath, pattern));
}

function isExcludedPath(relativePath) {
    const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
    if (/\.(test|spec)\.[jt]sx?$/.test(normalized)) return true;
    if (/\/tests?\//.test(normalized)) return true;
    if (/\/fixtures?\//.test(normalized)) return true;
    if (/\.example\.[a-z0-9]+$/i.test(normalized)) return true;
    if (/\.md$/i.test(normalized)) return true;
    return false;
}

function isAllowlistedMatch(line, matchText) {
    const snippet = `${line} ${matchText}`.toLowerCase();
    return ALLOWLIST_SNIPPETS.some((token) => snippet.includes(token));
}

/** SB-FICTION-002 must not flag regex/parsers that detect markdown fences (incl. this rule file). */
function isFenceDetectorMetaLine(line, relativePath, ruleId) {
    if (ruleId !== 'SB-FICTION-002') return false;
    const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
    if (normalized.endsWith('llm-slop-patterns.js')) return true;
    const trimmed = line.trim();
    if (/regex:\s*\/[`]{3}/.test(trimmed)) return true;
    if (/\.(?:match|replace|test|split)\(\s*\/[`]{3}/.test(trimmed)) return true;
    if (/\/[`]{3}[a-z]*/i.test(trimmed) && /\/[gimsuy]*['"]?\)/.test(trimmed)) return true;
    if (/[`]{3}(?:json|javascript|typescript|python)/i.test(trimmed)
        && /(?:match|replace|RegExp|extractJson|fenced)/.test(trimmed)) {
        return true;
    }
    return false;
}

function isCommentLine(line, ext) {
    const trimmed = line.trim();
    if (/^(\/\/|#|\*|\/\*)/.test(trimmed)) return true;
    if (ext === '.py' && trimmed.startsWith('#')) return true;
    return false;
}

async function walkFiles(dir, results = [], options = {}, depth = 0) {
    if (depth > 12) return results;
    let entries;
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            await walkFiles(fullPath, results, options, depth + 1);
            continue;
        }
        if (!entry.isFile()) continue;

        const ext = path.extname(entry.name).toLowerCase();
        const baseName = entry.name.toLowerCase();
        if (!SCANNABLE_EXTENSIONS.has(ext) && !MANIFEST_NAMES.has(baseName)) continue;

        const relativePath = normalizeRel(options.baseDir, fullPath);
        if (isExcludedPath(relativePath)) continue;
        if (isIgnored(relativePath, options.ignoreGlobs)) continue;

        try {
            const stat = await fs.promises.stat(fullPath);
            if (stat.size > MAX_SCAN_BYTES) continue;
            results.push({ path: fullPath, relativePath, ext, baseName, size: stat.size });
        } catch {
            /* skip */
        }
    }
    return results;
}

function scanTextPatterns(relativePath, content, ext) {
    const findings = [];
    const lines = content.split('\n');

    for (const rule of RULE_CATALOG) {
        if (rule.id === 'SB-FICTION-002' && ext === '.md') continue;

        rule.regex.lastIndex = 0;
        let match;
        while ((match = rule.regex.exec(content)) !== null) {
            const lineIndex = content.slice(0, match.index).split('\n').length - 1;
            const line = lines[lineIndex] || '';
            if (isAllowlistedMatch(line, match[0])) continue;
            if (isFenceDetectorMetaLine(line, relativePath, rule.id)) continue;
            if (isCommentLine(line, ext) && rule.id !== 'SB-FICTION-002') continue;

            findings.push({
                id: `llm-slop-${rule.id}-${relativePath}-${match.index}`,
                severity: rule.severity,
                type: 'LLM Slop Pattern',
                filePath: relativePath,
                file: relativePath,
                line: lineIndex + 1,
                pattern: rule.id,
                count: 1,
                description: `${relativePath}:${lineIndex + 1} ${rule.description}`,
                recommendedAction: 'Replace placeholder copy with production-ready values before client handoff',
                affectedFiles: [path.basename(relativePath)],
                metadata: {
                    ruleId: rule.id,
                    match: match[0].slice(0, 120)
                }
            });
        }
    }

    return findings;
}

function scanSuspiciousDependencies(relativePath, content) {
    if (path.basename(relativePath) !== 'package.json') return [];
    let pkg;
    try {
        pkg = JSON.parse(content);
    } catch {
        return [];
    }

    const findings = [];
    const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
    for (const section of sections) {
        const block = pkg[section];
        if (!block || typeof block !== 'object') continue;
        for (const name of Object.keys(block)) {
            if (!SUSPICIOUS_DEP_NAME.test(name)) continue;
            findings.push({
                id: `llm-slop-SB-FICTION-003-${relativePath}-${name}`,
                severity: 'high',
                type: 'LLM Slop Pattern',
                filePath: relativePath,
                file: relativePath,
                line: 1,
                pattern: 'SB-FICTION-003',
                count: 1,
                description: `${relativePath}: suspicious dependency name "${name}" (${section})`,
                recommendedAction: 'Verify package exists on npm/PyPI or remove fabricated dependency',
                affectedFiles: [relativePath],
                metadata: {
                    ruleId: 'SB-FICTION-003',
                    packageName: name,
                    section
                }
            });
        }
    }
    return findings;
}

function npmRegistryExists(packageName, timeoutMs = 4000) {
    return new Promise((resolve) => {
        const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
        const req = https.get(url, { timeout: timeoutMs }, (res) => {
            resolve(res.statusCode === 200);
            res.resume();
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
}

async function scanUnknownNpmDependencies(relativePath, content, options = {}) {
    if (path.basename(relativePath) !== 'package.json') return [];
    if (options.registryCheck !== true) return [];

    let pkg;
    try {
        pkg = JSON.parse(content);
    } catch {
        return [];
    }

    const names = new Set();
    for (const section of ['dependencies', 'devDependencies']) {
        const block = pkg[section];
        if (!block) continue;
        for (const name of Object.keys(block)) {
            if (name.startsWith('.') || name.startsWith('file:') || name.startsWith('workspace:')) continue;
            if (SUSPICIOUS_DEP_NAME.test(name)) continue;
            names.add(name);
        }
    }

    const flagged = [];
    const limit = Math.min(names.size, options.registryCheckLimit || 12);
    let checked = 0;
    for (const name of names) {
        if (checked >= limit) break;
        checked += 1;
        const exists = await npmRegistryExists(name, options.registryTimeoutMs || 4000);
        if (exists === false) {
            flagged.push({
                id: `llm-slop-registry-404-${relativePath}-${name}`,
                severity: 'high',
                type: 'LLM Slop Pattern',
                filePath: relativePath,
                file: relativePath,
                line: 1,
                pattern: 'SB-FICTION-003b',
                count: 1,
                description: `${relativePath}: npm registry 404 for "${name}" — possible hallucinated package`,
                recommendedAction: 'Remove or replace dependency; confirm package name on registry.npmjs.org',
                affectedFiles: [relativePath],
                metadata: {
                    ruleId: 'SB-FICTION-003b',
                    packageName: name,
                    registryStatus: 404
                }
            });
        }
    }
    return flagged;
}

async function scanLlmSlopPatterns(baseDir, options = {}) {
    const sourcePaths = options.sourcePaths || DEFAULT_SOURCE_PATHS;
    const productionPaths = options.productionPaths || sourcePaths;
    const pathsToWalk = [...new Set([...sourcePaths, ...productionPaths])];
    const ignoreGlobs = options.ignoreGlobs || [];

    const files = [];
    for (const rel of pathsToWalk) {
        const abs = path.isAbsolute(rel) ? rel : path.join(baseDir, ...rel.split('/'));
        if (fs.existsSync(abs)) {
            await walkFiles(abs, files, { baseDir, ignoreGlobs });
        }
    }

    const rootPackage = path.join(baseDir, 'package.json');
    if (fs.existsSync(rootPackage)) {
        files.push({
            path: rootPackage,
            relativePath: 'package.json',
            ext: '.json',
            baseName: 'package.json',
            size: fs.statSync(rootPackage).size
        });
    }

    const issues = [];
    for (const file of files) {
        let content;
        try {
            content = await fs.promises.readFile(file.path, 'utf8');
        } catch {
            continue;
        }
        issues.push(...scanTextPatterns(file.relativePath, content, file.ext));
        issues.push(...scanSuspiciousDependencies(file.relativePath, content));
        if (options.registryCheck === true) {
            issues.push(...await scanUnknownNpmDependencies(file.relativePath, content, options));
        }
    }

    return {
        scanned: files.length,
        findings: issues.length,
        issues,
        patterns: RULE_CATALOG.map((r) => r.id)
    };
}

module.exports = {
    RULE_CATALOG,
    scanLlmSlopPatterns,
    scanTextPatterns,
    scanSuspiciousDependencies,
    npmRegistryExists
};
