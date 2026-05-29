/**
 * Strip github-cache noise from file-reduction reports and flag stale full-tree scans.
 */

const { isExternalBenchmarkCachePath } = require('./benchmark-cache-paths');
const { aggregateCleanupFindings } = require('./result-aggregator');
const { globMatch } = require('../rules/production-leak');
const { DEFAULT_SKIP_GLOBS } = require('../analyzers/file-reduction/unused-file-detector');

const STALE_INVENTORY_FILE_THRESHOLD = 5000;

function collectFindingPaths(finding) {
    if (!finding || typeof finding !== 'object') return [];
    return [
        finding.path,
        finding.keeper,
        ...(finding.paths || []),
        ...(finding.duplicates || [])
    ].filter(Boolean);
}

function isBenchmarkFinding(finding) {
    return collectFindingPaths(finding).some(isExternalBenchmarkCachePath);
}

function isSkippedUnusedFinding(finding) {
    if (!finding || finding.type !== 'unused-file') return false;
    const normalized = String(finding.path || '').split('\\').join('/');
    return DEFAULT_SKIP_GLOBS.some((pattern) => globMatch(normalized, pattern));
}

function filterBenchmarkFindings(findings = []) {
    return findings.filter((finding) => !isBenchmarkFinding(finding) && !isSkippedUnusedFinding(finding));
}

function isStaleFileReductionScan(report) {
    const total = report?.inventory?.totalFiles ?? 0;
    if (total > STALE_INVENTORY_FILE_THRESHOLD) return true;

    const entryPoints = report?.metadata?.entryPoints || [];
    if (entryPoints.some(isExternalBenchmarkCachePath)) return true;

    const allFindings = report?.allFindings || [];
    return allFindings.some((finding) => isExternalBenchmarkCachePath(finding.path));
}

function countExcludedBenchmarkFindings(report) {
    const buckets = Object.values(report?.findings || {});
    let excluded = 0;
    for (const bucket of buckets) {
        if (!Array.isArray(bucket)) continue;
        for (const finding of bucket) {
            if (isBenchmarkFinding(finding)) excluded += 1;
        }
    }
    return excluded;
}

function recomputeSummary(filteredFindings, inventoryFiles) {
    const buildArtifacts = filteredFindings.buildArtifacts || [];
    const assetConsolidation = filteredFindings.assetConsolidation || [];
    const unusedFiles = filteredFindings.unusedFiles || [];
    const configManagement = filteredFindings.configManagement || [];
    const dependencyHealth = filteredFindings.dependencyHealth || [];
    const environmentVariables = filteredFindings.environmentVariables || [];
    const dataFreshness = filteredFindings.dataFreshness || [];
    const dataAccessPatterns = filteredFindings.dataAccessPatterns || [];
    const dataPrivacy = filteredFindings.dataPrivacy || [];
    const dataLineage = filteredFindings.dataLineage || [];
    const dataConsistency = filteredFindings.dataConsistency || [];

    const allFindings = [
        ...buildArtifacts,
        ...assetConsolidation,
        ...unusedFiles,
        ...configManagement,
        ...dependencyHealth,
        ...environmentVariables,
        ...dataFreshness,
        ...dataAccessPatterns,
        ...dataPrivacy,
        ...dataLineage,
        ...dataConsistency
    ];

    const reclaimableBytes = allFindings.reduce((sum, finding) => {
        if (finding.reclaimableBytes) return sum + finding.reclaimableBytes;
        if (finding.type === 'build-artifact') return sum + (finding.sizeBytes || 0);
        return sum;
    }, 0);

    return {
        allFindings,
        summary: {
            totalFindings: allFindings.length,
            buildArtifactFindings: buildArtifacts.length,
            duplicateAssetGroups: assetConsolidation.length,
            unusedFileCandidates: unusedFiles.length,
            configFindings: configManagement.length,
            dependencyFindings: dependencyHealth.length,
            environmentFindings: environmentVariables.length,
            dataFreshnessFindings: dataFreshness.length,
            dataAccessFindings: dataAccessPatterns.length,
            dataPrivacyFindings: dataPrivacy.length,
            dataLineageFindings: dataLineage.length,
            dataConsistencyFindings: dataConsistency.length,
            reclaimableBytes,
            estimatedReductionPct: inventoryFiles
                ? Math.round((allFindings.length / inventoryFiles) * 1000) / 10
                : 0
        }
    };
}

function normalizeFileReductionReport(report) {
    if (!report || report.type !== 'data-cleanup-report') return report;

    const staleFullTreeScan = isStaleFileReductionScan(report);
    const benchmarkExcluded = countExcludedBenchmarkFindings(report);
    const findings = report.findings || {};
    const filteredFindings = Object.fromEntries(
        Object.entries(findings).map(([key, bucket]) => [key, filterBenchmarkFindings(bucket)])
    );

    const inventoryFiles = staleFullTreeScan
        ? null
        : (report.inventory?.totalFiles ?? null);
    const { allFindings, summary } = recomputeSummary(filteredFindings, inventoryFiles || 1);
    const aggregated = aggregateCleanupFindings(allFindings);

    const staleLimitation = 'This report used a full-repo walk (69k+ files) — re-run file reduction after updating Simplebeacon to exclude github-cache/.';
    const benchmarkNote = 'github-cache/ OSS benchmark clones are excluded from platform file-reduction scoring (not your product code).';
    const priorLimitations = (report.scanScope?.limitations || []).filter(
        (line) => line && !/github-cache/.test(line) && line !== staleLimitation && line !== benchmarkNote
    );

    const scanScope = {
        ...(report.scanScope || {}),
        resultsViewScope: 'platform-only',
        reportHealth: staleFullTreeScan
            ? 'stale-full-tree-scan'
            : (report.scanScope?.reportHealth || 'platform-scoped'),
        rescanRecommended: staleFullTreeScan
            || benchmarkExcluded > 0
            || Boolean(report.scanScope?.rescanRecommended),
        benchmarkCacheFindingsExcluded: benchmarkExcluded,
        inventoryMetricsStale: staleFullTreeScan || Boolean(report.scanScope?.inventoryMetricsStale)
    };

    if (staleFullTreeScan || benchmarkExcluded > 0) {
        scanScope.limitations = [...new Set([
            ...priorLimitations,
            ...(staleFullTreeScan ? [staleLimitation, benchmarkNote] : []),
            ...(benchmarkExcluded > 0 && !staleFullTreeScan ? [benchmarkNote] : [])
        ])];
    } else if (priorLimitations.length) {
        scanScope.limitations = priorLimitations;
    }

    const normalized = {
        ...report,
        findings: filteredFindings,
        allFindings: aggregated.findings,
        aggregation: {
            bySeverity: {
                critical: aggregated.bySeverity.critical.length,
                high: aggregated.bySeverity.high.length,
                medium: aggregated.bySeverity.medium.length,
                low: aggregated.bySeverity.low.length
            },
            byCategory: aggregated.byCategory,
            topFiles: aggregated.topFiles
        },
        summary: {
            ...(report.summary || {}),
            ...summary
        },
        metadata: {
            ...(report.metadata || {}),
            entryPoints: (report.metadata?.entryPoints || []).filter((entry) => !isExternalBenchmarkCachePath(entry))
        },
        scanScope
    };

    if (staleFullTreeScan && normalized.inventory) {
        normalized.inventory = {
            ...normalized.inventory,
            note: 'Inventory counts reflect a stale full-tree scan — re-run with refresh=1 after server restart.'
        };
    }

    if (normalized.scanners?.['unused-files']) {
        normalized.scanners['unused-files'] = {
            ...normalized.scanners['unused-files'],
            unusedCandidates: filteredFindings.unusedFiles?.length ?? 0,
            entryPoints: normalized.metadata.entryPoints?.length ?? normalized.scanners['unused-files'].entryPoints
        };
    }

    return normalized;
}

module.exports = {
    normalizeFileReductionReport,
    isStaleFileReductionScan,
    filterBenchmarkFindings,
    isBenchmarkFinding,
    STALE_INVENTORY_FILE_THRESHOLD
};
