/**
 * Detect mock/sample/fixture paths referenced from production code directories.
 */

const fs = require('fs');
const path = require('path');
const { classifyProductionLeakMatch } = require('../lib/production-leak-intent');

const DEFAULT_PRODUCTION_PATHS = ['server/', 'src/', 'app/', 'lib/'];
const DEFAULT_IGNORE_GLOBS = [
    'node_modules/**',
    'coverage/**',
    'dist/**',
    'build/**',
    '**/*.test.js',
    '**/*.spec.js',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.test.tsx',
    '**/*.spec.tsx',
    'tests/**',
    'test/**'
];

const LEAK_PATTERNS = [
    { id: 'sample-json', regex: /['"`][^'"`]*-sample\.json['"`]/gi },
    { id: 'mock-path', regex: /['"`][^'"`]*(?:\/|\\)mock(?:\/|\\)[^'"`]+['"`]/gi },
    { id: 'fixtures-path', regex: /['"`][^'"`]*(?:\/|\\)fixtures(?:\/|\\)[^'"`]+['"`]/gi },
    { id: 'web-data-sample', regex: /['"`][^'"`]*web(?:\/|\\)data[^'"`]*['"`]/gi },
    {
        id: 'template-sample',
        regex: /`[^`]*(?:-sample\.json|(?:\/|\\)mock(?:\/|\\)[^`]+|(?:\/|\\)fixtures(?:\/|\\)[^`]+|web(?:\/|\\)data)[^`]*`/gi
    }
];

const PLAIN_SAMPLE_JSON_PATTERN = {
    id: 'plain-sample-json',
    regex: /['"`][^'"`]*(?:\/|\\|\.\/)(?<![\w-])sample\.json(?:\?[^'"`]*)?['"`]/gi
};

function getActiveLeakPatterns(options = {}) {
    if (!options.plainSampleJson) {
        return LEAK_PATTERNS;
    }
    return [...LEAK_PATTERNS, PLAIN_SAMPLE_JSON_PATTERN];
}

const SCANNABLE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);
const MAX_SCAN_BYTES = 512000;
const NON_PRODUCTION_PATH_HINTS = [
    '/test/', '/tests/', '/__tests__/', '.test.', '.spec.',
    '/fixtures/', '/fixture/', '/mock/', '/mocks/', '/docs/', '/examples/',
    '/storybook/', '/scripts/', '/dev/', '/demo/'
];
const CONFIG_FILE_NAMES = new Set([
    'webpack.config.js',
    'vite.config.js',
    'vitest.config.js',
    'jest.config.js',
    'rollup.config.js'
]);

function normalizeRel(baseDir, filePath) {
    return path.relative(baseDir, filePath).split(path.sep).join('/');
}

function lineNumberAt(content, index) {
    return content.slice(0, Math.max(0, index)).split('\n').length;
}

function globMatch(relativePath, pattern) {
    const normalized = relativePath.split('\\').join('/');
    const p = pattern.split('\\').join('/');

    if (p.includes('node_modules')) {
        return normalized.includes('node_modules/') || normalized.startsWith('node_modules/');
    }
    if (p === 'tests/**' || p.endsWith('/tests/**')) {
        return normalized.startsWith('tests/') || normalized.includes('/tests/');
    }
    if (p === 'test/**' || p.endsWith('/test/**')) {
        return normalized.startsWith('test/') || normalized.includes('/test/');
    }
    if (p.includes('**')) {
        const suffix = p.replace(/^\*\*\//, '');
        if (suffix.startsWith('*.')) {
            return normalized.endsWith(suffix.slice(1));
        }
        if (suffix.endsWith('/**')) {
            const prefix = suffix.replace(/\/\*\*$/, '');
            return normalized === prefix || normalized.startsWith(`${prefix}/`) || normalized.includes(`/${prefix}/`);
        }
        if (p.startsWith('**/') && suffix !== p) {
            const tailRegex = new RegExp(
                `(^|/)${suffix.replace(/\./g, '\\.').replace(/\*/g, '[^/]*')}$`
            );
            return tailRegex.test(normalized);
        }
    }
    const regex = new RegExp(
        `^${p.replace(/\./g, '\\.').replace(/\*/g, '[^/]*')}$`
    );
    return regex.test(normalized);
}

function isIgnored(relativePath, ignoreGlobs) {
    return ignoreGlobs.some((pattern) => globMatch(relativePath, pattern));
}

function isAllowlisted(relativePath, allowlistFiles) {
    const normalized = relativePath.split('\\').join('/');
    return allowlistFiles.some((entry) => normalized === entry.split('\\').join('/'));
}

function isScannerMetaFile(relativePath, userMetaFiles = []) {
    const normalized = relativePath.split('\\').join('/');
    return userMetaFiles.some(entry => normalized === entry.split('\\').join('/'));
}

function isCommentLine(line) {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function isLikelyConfigReference(relativePath, matchText) {
    const base = path.basename(relativePath);
    if (CONFIG_FILE_NAMES.has(base)) return true;
    if (/\.simplebeacon|truthcheck|repository-audit|page-sample-specs/i.test(matchText)) return true;
    return false;
}

function isProseSampleReference(matchText) {
    return /mock\/sample(?:\s+(?:json|files|data|paths?|only)|\s*—)/i.test(matchText)
        || /Mock\/sample\s+files/i.test(matchText);
}

function isInstructionalTemplateReference(matchText) {
    return /instead of\s+["'`]template(?:\s|-)sample["'`]/i.test(matchText)
        || /use the phrase\s+["'`]sample-suffix subset["'`]/i.test(matchText);
}

function isProductionRelevantPath(relativePath) {
    const normalized = String(relativePath || '').replace(/\\/g, '/').toLowerCase();
    return !NON_PRODUCTION_PATH_HINTS.some((hint) => normalized.includes(hint));
}

function mapSeverityBand(relativePath, patternId) {
    if (!isProductionRelevantPath(relativePath)) return 'medium';
    if (patternId === 'sample-json' || patternId === 'web-data-sample') {
        return 'critical';
    }
    if (patternId === 'plain-sample-json' || patternId === 'mock-path' || patternId === 'template-sample') {
        return 'high';
    }
    return 'medium';
}

function buildRecommendation(patternId) {
    if (patternId === 'sample-json' || patternId === 'web-data-sample') {
        return 'Replace hardcoded sample data imports with measured runtime API/scanner output before release';
    }
    if (patternId === 'plain-sample-json') {
        return 'Replace plain sample.json imports with live data sources or move demo defaults behind example/dev routes';
    }
    if (patternId === 'mock-path' || patternId === 'template-sample') {
        return 'Move mock-only paths behind test/dev gates and keep production paths bound to live data sources';
    }
    return 'Audit fixture usage and remove mock references from production-bound modules';
}

async function walkProductionFiles(dir, results = [], depth = 0) {
    if (depth > 8) return results;
    let entries;
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (['node_modules', '.git', 'coverage', 'dist', 'build'].includes(entry.name)) continue;
            await walkProductionFiles(fullPath, results, depth + 1);
            continue;
        }
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!SCANNABLE_EXTENSIONS.has(ext)) continue;
        try {
            const stat = await fs.promises.stat(fullPath);
            if (stat.size > MAX_SCAN_BYTES) continue;
            results.push({ path: fullPath, name: entry.name, ext, size: stat.size });
        } catch {
            /* skip */
        }
    }
    return results;
}

function scanFileContent(relativePath, content, options = {}) {
    const findings = [];
    const suppressed = [];
    const intentClassification = options.intentClassification !== false;
    const fallbackSeverityBand = options.severityBand || options.severity || 'high';
    const lines = content.split('\n');
    const patterns = getActiveLeakPatterns(options);

    for (const pattern of patterns) {
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(content)) !== null) {
            const lineIndex = content.slice(0, match.index).split('\n').length - 1;
            const line = lines[lineIndex] || '';
            if (isCommentLine(line)) continue;
            const snippet = content.slice(Math.max(0, match.index - 12), match.index + match[0].length + 12);
            if (isLikelyConfigReference(relativePath, snippet)) continue;
            if (isProseSampleReference(match[0])) continue;
            if (isInstructionalTemplateReference(match[0])) continue;

            let intentResult = null;
            if (intentClassification) {
                intentResult = classifyProductionLeakMatch({
                    relativePath,
                    content,
                    lineIndex,
                    matchText: match[0],
                    patternId: pattern.id
                });
                if (intentResult.suppress) {
                    suppressed.push({
                        filePath: relativePath,
                        line: lineNumberAt(content, match.index),
                        pattern: pattern.id,
                        intent: intentResult.intent,
                        reason: intentResult.reason,
                        match: match[0]
                    });
                    continue;
                }
            }

            const lineNum = lineNumberAt(content, match.index);
            const severityBand = intentResult?.severityBand
                || ((options.severityBand || options.severity)
                    ? fallbackSeverityBand
                    : mapSeverityBand(relativePath, pattern.id));
            const recommendation = buildRecommendation(pattern.id);
            findings.push({
                id: `production-leak-${pattern.id}-${relativePath}-${match.index}`,
                severity: severityBand === 'critical' ? 'high' : severityBand,
                severityBand,
                type: 'Production Leak',
                filePath: relativePath,
                file: relativePath,
                line: lineNum,
                pattern: pattern.id,
                count: 1,
                description: `${relativePath}:${lineNum} references mock/sample path (${pattern.id})`,
                recommendation,
                recommendedAction: recommendation,
                affectedFiles: [path.basename(relativePath)],
                metadata: {
                    patternId: pattern.id,
                    offset: match.index,
                    match: match[0],
                    intent: intentResult?.intent || 'unclassified',
                    intentReason: intentResult?.reason || null,
                    findingPayload: {
                        file: relativePath,
                        line: lineNum,
                        pattern: pattern.id,
                        recommendation
                    }
                }
            });
        }
    }

    return { findings, suppressed };
}

async function scanProductionLeaks(baseDir, options = {}) {
    const productionPaths = options.productionPaths || DEFAULT_PRODUCTION_PATHS;
    const ignoreGlobs = options.ignoreGlobs || DEFAULT_IGNORE_GLOBS;
    const allowlistFiles = (options.allowlistFiles || []).map((p) => p.split('\\').join('/'));
    const scannerMetaFiles = options.scannerMetaFiles || [];
    const severity = options.severity || 'high';

    const files = [];
    for (const rel of productionPaths) {
        const abs = path.isAbsolute(rel) ? rel : path.join(baseDir, ...rel.split('/'));
        if (fs.existsSync(abs)) {
            await walkProductionFiles(abs, files);
        }
    }

    const issues = [];
    const suppressedIntent = [];
    let scanned = 0;

    for (const file of files) {
        const relativePath = normalizeRel(baseDir, file.path);
        if (isIgnored(relativePath, ignoreGlobs)) continue;
        if (isAllowlisted(relativePath, allowlistFiles)) continue;
        if (isScannerMetaFile(relativePath, scannerMetaFiles)) continue;

        let content;
        try {
            content = await fs.promises.readFile(file.path, 'utf8');
        } catch {
            continue;
        }

        scanned += 1;
        const result = scanFileContent(relativePath, content, {
            severity,
            intentClassification: options.intentClassification !== false,
            plainSampleJson: options.plainSampleJson === true
        });
        issues.push(...result.findings);
        suppressedIntent.push(...result.suppressed);
    }

    return {
        scanned,
        findings: issues.length,
        issues,
        suppressedIntent,
        suppressedIntentCount: suppressedIntent.length
    };
}

module.exports = {
    DEFAULT_PRODUCTION_PATHS,
    DEFAULT_IGNORE_GLOBS,
    LEAK_PATTERNS,
    PLAIN_SAMPLE_JSON_PATTERN,
    getActiveLeakPatterns,
    scanProductionLeaks,
    scanFileContent,
    globMatch,
    walkProductionFiles
};
