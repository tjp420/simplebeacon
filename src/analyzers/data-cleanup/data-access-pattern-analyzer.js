/**
 * Detect risky or inefficient filesystem/data access patterns in code.
 */

const fs = require('fs');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

const SKIP_PATH_PREFIXES = [
    'packages/simplebeacon-cli/bin/',
    'packages/simplebeacon-cli/tests/',
    'packages/simplebeacon-cli/src/analyzers/',
    'packages/simplebeacon-cli/src/reporters/',
    'packages/simplebeacon-cli/src/proxy/',
    'tools/'
];

const SKIP_PATH_HINTS = [
    '/tests/', '/test/', '/__tests__/',
    '.test.', '.spec.',
    'data-access-pattern-analyzer.js',
    'json-file-cache.js',
    'final_cleanup.cjs',
    'ultimate_cleanup.cjs'
];

const BATCH_SCANNER_PATHS = [
    'server/lib/codebase-analyzer.js',
    'server/lib/code-roadmap-generator.js',
    'server/lib/code-roadmap-phase2.js',
    'server/lib/code-understanding/',
    'server/lib/file-merger-reduction-scanner.js',
    'packages/simplebeacon-cli/src/compliance-checklist.js',
    'packages/simplebeacon-cli/src/scan.js',
    'packages/simplebeacon-cli/src/fix-dry-run.js',
    'packages/simplebeacon-cli/src/lib/file-validator.js'
];

function shouldSkipDataAccessScan(relativePath) {
    const rel = String(relativePath || '').replace(/\\/g, '/');
    if (SKIP_PATH_PREFIXES.some((prefix) => rel.startsWith(prefix))) return true;
    if (SKIP_PATH_HINTS.some((hint) => rel.includes(hint))) return true;
    if (BATCH_SCANNER_PATHS.some((hint) => rel.includes(hint))) return true;
    return false;
}

function isLazyCachedSyncRead(content, matchIndex) {
    const windowStart = Math.max(0, matchIndex - 400);
    const snippet = String(content || '').slice(windowStart, matchIndex + 120);
    return /\bif\s*\(\s*!cached[A-Za-z0-9_]*\s*\)/.test(snippet)
        || /\blet\s+cached[A-Za-z0-9_]*\s*=\s*null/.test(snippet);
}

const ACCESS_PATTERNS = [
    {
        id: 'sync-read-in-iteration',
        regex: /\.(?:map|forEach|filter|reduce)\s*\([\s\S]{0,500}?readFile(?:Sync)?\s*\(/g,
        reason: 'Filesystem read inside array iteration — possible N+1 I/O pattern',
        severity: 'medium',
        action: 'batch-or-cache-reads'
    },
    {
        id: 'sync-read-in-route',
        regex: /(?:router|app)\.(?:get|post|put|delete|patch)\s*\([\s\S]{0,700}?readFileSync\s*\(/g,
        reason: 'Synchronous filesystem read inside HTTP route handler',
        severity: 'high',
        action: 'async-read-or-cache'
    },
    {
        id: 'parse-sync-read',
        regex: /JSON\.parse\s*\(\s*fs\.readFileSync\s*\(/g,
        reason: 'JSON.parse(fs.readFileSync()) blocks event loop on every call',
        severity: 'medium',
        action: 'load-at-startup-or-cache'
    },
    {
        id: 'read-in-while-loop',
        regex: /while\s*\([\s\S]{0,400}?readFile(?:Sync)?\s*\(/g,
        reason: 'Filesystem read inside while loop',
        severity: 'medium',
        action: 'review-loop-io'
    }
];

class DataAccessPatternAnalyzer {
    constructor(config = {}) {
        this.sourcePrefixes = config.sourcePrefixes || ['server/', 'src/', 'packages/', 'lib/'];
        this.maxFiles = config.maxFiles ?? 2500;
    }

    async scan(projectRoot, options = {}) {
        const inventory = options.inventory;
        const sourceFiles = inventory.files
            .filter((file) => SOURCE_EXTENSIONS.has(file.ext))
            .filter((file) => this.sourcePrefixes.some((prefix) => file.relativePath.startsWith(prefix)))
            .slice(0, this.maxFiles);

        const findings = [];

        for (const file of sourceFiles) {
            if (shouldSkipDataAccessScan(file.relativePath)) continue;

            let content = '';
            try {
                content = await fs.promises.readFile(file.path, 'utf8');
            } catch {
                continue;
            }

            for (const pattern of ACCESS_PATTERNS) {
                pattern.regex.lastIndex = 0;
                const match = pattern.regex.exec(content);
                if (!match) continue;
                if (pattern.id === 'parse-sync-read' && isLazyCachedSyncRead(content, match.index)) continue;
                findings.push({
                    type: 'data-access-pattern',
                    path: file.relativePath,
                    reason: pattern.reason,
                    severity: pattern.severity,
                    confidence: 'medium',
                    action: pattern.action,
                    metadata: { patternId: pattern.id }
                });
                break;
            }
        }

        return {
            scanner: 'data-access-patterns',
            findings,
            summary: {
                sourceFilesScanned: sourceFiles.length,
                patternFindings: findings.length
            }
        };
    }
}

module.exports = {
    DataAccessPatternAnalyzer,
    ACCESS_PATTERNS,
    shouldSkipDataAccessScan,
    isLazyCachedSyncRead
};
