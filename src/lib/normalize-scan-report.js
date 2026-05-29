/**
 * Align simplebeacon-report top-level metrics with platform-only issue lists.
 */

const { partitionBenchmarkIssues, isExternalBenchmarkCachePath } = require('./benchmark-cache-paths');
const { evaluateGate } = require('../gate');
const { countBySeverity, isBlockingIssue, groupIssues } = require('./issue-utils');

const INFORMATIONAL_ISSUE_TYPES = new Set([
    'Legacy Fiction Roadmap',
    'Oversized Roadmap File'
]);

function isStaleFullTreeScan(report) {
    const mock = report.mockSampleFiles ?? report.totalFiles ?? 0;
    const repoFiles = report.repositoryFilesTotal ?? 0;
    const paths = (report.scanPaths || []).map((p) => String(p).replace(/\\/g, '/').toLowerCase());
    const platformKey = String(report.projectRoot || '').replace(/\\/g, '/').toLowerCase();
    const scanIsPlatformRootOnly = paths.length === 1 && paths[0] === platformKey;
    return mock > 500 || scanIsPlatformRootOnly || repoFiles > 15000;
}

function countIssuesByType(issues, typePattern) {
    return issues
        .filter((issue) => typePattern.test(String(issue.type || '')))
        .reduce((sum, issue) => sum + (issue.count || 1), 0);
}

function recomputeQualityScore(issues) {
    const severityWeight = { critical: 12, high: 6, medium: 2, low: 1 };
    const weightedPenalty = issues
        .filter((issue) => !INFORMATIONAL_ISSUE_TYPES.has(issue.type) && isBlockingIssue(issue))
        .reduce((sum, issue) => {
            const band = issue.severityBand || issue.severity || 'low';
            return sum + (severityWeight[band] || 1) * (issue.count || 1);
        }, 0);
    return Math.max(0, Math.min(100, Math.round(100 - Math.min(weightedPenalty, 85))));
}

function normalizePlatformScanReport(report, options = {}) {
    if (!report || report.type !== 'simplebeacon-report') return report;

    const sourceIssues = (report.rawIssues && report.rawIssues.length)
        ? report.rawIssues
        : (report.detectedIssues || []);
    const { platformIssues, benchmarkCacheIssues, excludedScanNoiseIssues } = partitionBenchmarkIssues(sourceIssues);
    const deduped = [];
    const seen = new Set();
    for (const issue of platformIssues) {
        const key = issue.id || `${issue.severity}|${issue.type}|${issue.filePath}|${issue.description}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(issue);
    }

    const issueCount = deduped
        .filter(isBlockingIssue)
        .reduce((sum, issue) => sum + (issue.count || 1), 0);
    const severityCounts = countBySeverity(deduped);
    const gateConfig = options.gateConfig || report.gate || report.scanScope?.gatePolicy || {};
    const gateEval = evaluateGate({ rawIssues: deduped }, gateConfig);
    const gate = {
        pass: gateEval.pass,
        failOn: gateEval.failOn,
        warnOn: gateEval.warnOn,
        blockingCount: gateEval.blockingIssues.reduce((sum, i) => sum + (i.count || 1), 0),
        warningCount: gateEval.warningIssues.reduce((sum, i) => sum + (i.count || 1), 0)
    };

    const staleFullTreeScan = isStaleFullTreeScan(report);

    const scanScope = {
        ...(report.scanScope || {}),
        resultsViewScope: 'platform-only',
        benchmarkCacheIssuesExcluded: benchmarkCacheIssues.length,
        excludedPathsNote: benchmarkCacheIssues.length
            ? `${benchmarkCacheIssues.length} issue(s) from github-cache/ benchmark clones excluded from platform gate scores.`
            : report.scanScope?.excludedPathsNote || null,
        reportHealth: staleFullTreeScan
            ? 'stale-full-tree-scan'
            : (report.scanScope?.reportHealth || 'platform-scoped'),
        rescanRecommended: staleFullTreeScan
            || benchmarkCacheIssues.length > 0
            || Boolean(report.scanScope?.rescanRecommended)
    };

    const staleLimitation = 'This report used a full-repo walk (69k+ files) — re-run scan after updating Simplebeacon to scope mock paths to web/data only.';
    const benchmarkNote = 'github-cache/ OSS benchmark clones are excluded from platform gate scoring (not your product code).';
    const priorLimitations = (report.scanScope?.limitations || []).filter(
        (line) => line && !/github-cache/.test(line) && line !== staleLimitation && line !== benchmarkNote
    );
    if (staleFullTreeScan) {
        scanScope.limitations = [...new Set([...priorLimitations, staleLimitation, benchmarkNote])];
        scanScope.inventoryMetricsStale = true;
    } else if (priorLimitations.length) {
        scanScope.limitations = priorLimitations;
    }
    if (excludedScanNoiseIssues.length) {
        scanScope.excludedScanNoiseIssues = excludedScanNoiseIssues.length;
    }

    const normalized = {
        ...report,
        rawIssues: deduped,
        detectedIssues: groupIssues(deduped).slice(0, 12),
        benchmarkCacheIssues,
        issueCount,
        severityCounts,
        qualityScore: recomputeQualityScore(deduped),
        invalidJson: countIssuesByType(deduped, /invalid json/i),
        credentialFindings: countIssuesByType(deduped, /credential/i),
        productionLeakFindings: countIssuesByType(deduped, /production leak/i),
        duplicateGroups: deduped.filter((i) => /duplicate/i.test(String(i.type || ''))).length,
        gate,
        scanScope
    };

    if (staleFullTreeScan) {
        normalized.mockDataCategories = [{
            category: 'Stale inventory (full-tree scan)',
            fileCount: normalized.mockSampleFiles,
            totalSize: normalized.totalSizeLabel || null,
            qualityScore: null,
            issues: null,
            confidence: null,
            description: 'Re-run scan to refresh — current categories reflect an outdated full-repo walk, not web/data samples.'
        }];
    }

    return normalized;
}

module.exports = {
    normalizePlatformScanReport,
    isStaleFullTreeScan,
    recomputeQualityScore,
    isExternalBenchmarkCachePath
};
