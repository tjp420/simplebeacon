/**
 * Paths under github-cache/ are OSS benchmark clones — not Simplebeacon platform product code.
 */

function normalizeRel(filePath) {
    return String(filePath || '').replace(/\\/g, '/').toLowerCase();
}

function isExternalBenchmarkCachePath(filePath) {
    const rel = normalizeRel(filePath);
    return rel.includes('/github-cache/') || rel.startsWith('github-cache/')
        || rel.includes('/java-ai-vulnerable/') || rel.startsWith('java-ai-vulnerable/');
}

function isExcludedCredentialScanPath(filePath) {
    const rel = normalizeRel(filePath);
    if (isExternalBenchmarkCachePath(rel)) return true;
    if (rel.includes('credential-incident-triage.json')) return true;
    if (/^tests\//.test(rel) || /\/tests\//.test(rel) || /^test\//.test(rel)) return true;
    if (/\/fixtures\//.test(rel) || /\/__tests__\//.test(rel)) return true;
    if (/\/\.simplebeacon\//.test(rel) || rel.startsWith('.simplebeacon/')) return true;
    if (rel.includes('/complete-scan-latest.json') || rel.includes('/complete-scan-post-')) return true;
    if (/\/deliverables\//.test(rel) || rel.startsWith('deliverables/')) return true;
    if (/\/docs\//.test(rel) && rel.endsWith('.md')) return true;
    return false;
}

function issueTouchesExcludedPath(issue) {
    const paths = [
        issue?.filePath,
        issue?.file,
        ...(issue?.filePaths || []),
        ...(issue?.affectedFiles || [])
    ].filter(Boolean);
    return paths.some(isExcludedCredentialScanPath);
}

function issueTouchesBenchmarkCache(issue) {
    const paths = [
        issue?.filePath,
        issue?.file,
        ...(issue?.filePaths || []),
        ...(issue?.affectedFiles || [])
    ].filter(Boolean);
    return paths.some(isExternalBenchmarkCachePath);
}

function partitionBenchmarkIssues(issues = []) {
    const platformIssues = [];
    const benchmarkCacheIssues = [];
    const excludedScanNoiseIssues = [];
    for (const issue of issues) {
        if (issueTouchesBenchmarkCache(issue)) {
            benchmarkCacheIssues.push(issue);
        } else if (issueTouchesExcludedPath(issue)) {
            excludedScanNoiseIssues.push(issue);
        } else {
            platformIssues.push(issue);
        }
    }
    return { platformIssues, benchmarkCacheIssues, excludedScanNoiseIssues };
}

const MOCK_WALK_SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    'uploads',
    'coverage',
    'archive',
    'dist',
    'build',
    '.next',
    '.cache',
    'github-cache',
    'deliverables',
    'java-ai-vulnerable',
    '.simplebeacon',
    'data-central',
    'security-reports'
]);

module.exports = {
    isExternalBenchmarkCachePath,
    isExcludedCredentialScanPath,
    issueTouchesBenchmarkCache,
    issueTouchesExcludedPath,
    partitionBenchmarkIssues,
    MOCK_WALK_SKIP_DIRS
};
