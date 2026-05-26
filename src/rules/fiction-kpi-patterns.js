/**
 * Line-based fiction KPI detection in source files (.js, .ts, .jsx, .tsx, .py).
 * Uses baseline rejectedFiction values — excludes tests, docs, and pattern catalogs.
 */

const fs = require('fs');
const path = require('path');
const { globMatch } = require('./production-leak');
const { shouldExcludePath } = require('../lib/path-exclusion-filter');

const DEFAULT_SOURCE_PATHS = ['server', 'src', 'web', 'lib', 'packages'];
const SCANNABLE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py']);
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'coverage', 'dist', 'build', 'archive',
    '.simplebeacon', 'tests', 'test', '__tests__', 'fixtures', 'docs'
]);
const MAX_SCAN_BYTES = 512000;

const EXCLUSION_SUBSTRINGS = [
    '_example_only_placeholder',
    'rejectedFiction',
    'fictionRemoved',
    'fictionVsReality',
    'not model output',
    'legacy demo',
    'false positive',
    'baseline false'
];

function buildPatternsFromBaseline(baseline = {}) {
    const fiction = baseline.rejectedFiction || {};
    const patterns = [];

    for (const rate of fiction.completionRates || []) {
        const value = String(rate).replace(/\.0+$/, '');
        patterns.push({
            id: `completion-rate-${value}`,
            regex: new RegExp(`\\b${value.replace('.', '\\.')}\\s*%\\b`, 'gi'),
            severity: 'medium',
            description: `Hardcoded rejected completion rate (${value}%)`
        });
    }

    for (const score of fiction.aiConfidenceScores || []) {
        const value = String(score).replace(/\.0+$/, '');
        patterns.push({
            id: `ai-confidence-${value}`,
            regex: new RegExp(`(?:aiConfidence|confidence)\\s*[:=]\\s*["']?${value.replace('.', '\\.')}\\b`, 'gi'),
            severity: 'medium',
            description: `Hardcoded rejected AI confidence (${value}%)`
        });
    }

    for (const count of fiction.featureCounts || []) {
        patterns.push({
            id: `feature-count-${count}`,
            regex: new RegExp(
                `\\b(?:totalFeatures|featuresTracked|aiOptimizationsApplied)\\s*[:=]\\s*["']?${count}\\b`,
                'gi'
            ),
            severity: 'medium',
            description: `Hardcoded rejected feature count (${count})`
        });
    }

    for (const count of fiction.openIssueCounts || []) {
        patterns.push({
            id: `open-issues-${count}`,
            regex: new RegExp(
                `\\b(?:issuesDetected|issuesFound|patternsIdentified|openIssues)\\s*[:=]\\s*["']?${count}\\b`,
                'gi'
            ),
            severity: 'medium',
            description: `Hardcoded rejected open-issue count (${count})`
        });
    }

    return patterns;
}

function normalizeRel(baseDir, filePath) {
    return path.relative(baseDir, filePath).split(path.sep).join('/');
}

function isIgnored(relativePath, ignoreGlobs) {
    return ignoreGlobs.some((pattern) => globMatch(relativePath, pattern));
}

function isExcludedPath(relativePath, userExclusions = []) {
    const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
    
    // Test and fixture exclusions (always applied)
    if (/\.(test|spec)\.[jt]sx?$/.test(normalized)) return true;
    if (/\/tests?\//.test(normalized)) return true;
    if (/\/fixtures?\//.test(normalized)) return true;
    if (/\/examples?\//.test(normalized)) return true;
    
    // Scanner-specific file exclusions (prevent self-scanning)
    const scannerFiles = [
        'fiction-kpi-patterns.js',
        'scan-source-kpi-patterns.js',
        'fiction-pattern-remediation-map.js',
        'ai-fiction-detection.js',
        'sample-consistency-checker.js'
    ];
    if (scannerFiles.some(file => normalized.includes(file))) return true;
    
    // Apply dynamic user exclusions from config
    if (shouldExcludePath(normalized, userExclusions)) return true;
    
    return false;
}

function isCommentLine(line, ext) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
    if (ext === '.py' && trimmed.startsWith('#')) return true;
    return false;
}

function isDocumentationContext(line) {
    const lower = line.toLowerCase();
    if (EXCLUSION_SUBSTRINGS.some((token) => lower.includes(token.toLowerCase()))) return true;
    if (/\bgeneratemock\w*\(/i.test(lower)) return true;
    if (/\bcreatemock\w*\(/i.test(lower)) return true;
    if (/\bgetmock\w*\(/i.test(lower)) return true;
    return false;
}

async function walkSourceFiles(dir, results = [], options = {}, depth = 0) {
    if (depth > 10) return results;
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
            await walkSourceFiles(fullPath, results, options, depth + 1);
            continue;
        }
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!SCANNABLE_EXTENSIONS.has(ext)) continue;

        const relativePath = normalizeRel(options.baseDir, fullPath);
        if (isExcludedPath(relativePath, options.pathExclusions || [])) continue;
        if (isIgnored(relativePath, options.ignoreGlobs || [])) continue;

        try {
            const stat = await fs.promises.stat(fullPath);
            if (stat.size > MAX_SCAN_BYTES) continue;
            results.push({ path: fullPath, relativePath, ext, size: stat.size });
        } catch {
            /* skip */
        }
    }
    return results;
}

function scanFileContent(relativePath, content, patterns, ext) {
    const findings = [];
    const lines = content.split('\n');

    for (const pattern of patterns) {
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(content)) !== null) {
            const lineIndex = content.slice(0, match.index).split('\n').length - 1;
            const line = lines[lineIndex] || '';
            if (isCommentLine(line, ext) && isDocumentationContext(line)) continue;
            if (isDocumentationContext(line)) continue;

            findings.push({
                id: `source-fiction-${pattern.id}-${relativePath}-${match.index}`,
                severity: pattern.severity,
                type: 'Source Fiction KPI Pattern',
                filePath: relativePath,
                file: relativePath,
                line: lineIndex + 1,
                pattern: pattern.id,
                count: 1,
                description: `${relativePath}:${lineIndex + 1} ${pattern.description}`,
                recommendedAction: 'Replace with measured repository-audit values or move to sample JSON only',
                affectedFiles: [path.basename(relativePath)],
                metadata: {
                    patternId: pattern.id,
                    match: match[0]
                }
            });
        }
    }

    return findings;
}

async function scanSourceFictionPatterns(baseDir, options = {}) {
    const sourcePaths = options.sourcePaths || DEFAULT_SOURCE_PATHS;
    const ignoreGlobs = options.ignoreGlobs || [];
    const pathExclusions = options.pathExclusions || [];
    const baseline = options.baseline || {};
    const patterns = buildPatternsFromBaseline(baseline);

    if (patterns.length === 0) {
        return { scanned: 0, findings: 0, issues: [], patterns: [] };
    }

    const files = [];
    for (const rel of sourcePaths) {
        const abs = path.isAbsolute(rel) ? rel : path.join(baseDir, ...rel.split('/'));
        if (fs.existsSync(abs)) {
            await walkSourceFiles(abs, files, { baseDir, ignoreGlobs, pathExclusions });
        }
    }

    const issues = [];
    for (const file of files) {
        let content;
        try {
            content = await fs.promises.readFile(file.path, 'utf8');
        } catch {
            continue;
        }
        issues.push(...scanFileContent(file.relativePath, content, patterns, file.ext));
    }

    return {
        scanned: files.length,
        findings: issues.length,
        issues,
        patterns: patterns.map((p) => p.id),
        sourcePaths
    };
}

module.exports = {
    DEFAULT_SOURCE_PATHS,
    SCANNABLE_EXTENSIONS,
    buildPatternsFromBaseline,
    scanSourceFictionPatterns,
    scanFileContent,
    walkSourceFiles
};
