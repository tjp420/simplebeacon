/**
 * Add executive summary, scanner statistics, and file reduction plan to legacy reports.
 */

const { isWorkspacePath } = require('../analyzers/data-cleanup/utils/workspace-path-utils');
const { buildExecutiveSummary } = require('./executive-summary');
const { buildScannerStatistics } = require('./scanner-statistics');
const { buildFileReductionPlan } = require('./file-reduction-plan');
const { normalizeFileReductionReport } = require('./normalize-file-reduction-report');

function filterWorkspaceFindings(findings = []) {
    return findings.filter((finding) => isWorkspacePath(finding.path));
}

function countByType(findings = []) {
    const counts = {};
    for (const finding of findings) {
        const key = finding.type || 'other';
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
}

function rebuildWorkspaceScopedSummaries(report) {
    const findings = report.findings || {};
    const configFindings = filterWorkspaceFindings(findings.configManagement);
    const dependencyFindings = filterWorkspaceFindings(findings.dependencyHealth);
    const environmentFindings = filterWorkspaceFindings(findings.environmentVariables);
    const configCounts = countByType(configFindings);
    const depCounts = countByType(dependencyFindings);
    const envCounts = countByType(environmentFindings);

    report.findings = {
        ...findings,
        configManagement: configFindings,
        dependencyHealth: dependencyFindings,
        environmentVariables: environmentFindings
    };

    report.scanners = {
        ...(report.scanners || {}),
        'config-management': {
            ...(report.scanners?.['config-management'] || {}),
            configFiles: configFindings.length > 0
                ? new Set(configFindings.map((finding) => finding.path)).size
                : report.scanners?.['config-management']?.configFiles,
            envFiles: report.scanners?.['config-management']?.envFiles,
            packageJsonFiles: new Set(
                configFindings
                    .filter((finding) => String(finding.path || '').endsWith('package.json'))
                    .map((finding) => finding.path)
            ).size || report.scanners?.['config-management']?.packageJsonFiles,
            sprawlFindings: configCounts['config-sprawl'] || 0,
            duplicateConfigTypes: configCounts['duplicate-config-type'] || 0,
            inconsistentEnvKeys: configCounts['env-inconsistency'] || 0
        },
        'dependency-health': {
            ...(report.scanners?.['dependency-health'] || {}),
            packageJsonFiles: new Set(dependencyFindings.map((finding) => finding.path)).size
                || report.scanners?.['dependency-health']?.packageJsonFiles
                || 0,
            uniqueDependencies: new Set(
                dependencyFindings
                    .map((finding) => finding.metadata?.dependency)
                    .filter(Boolean)
            ).size || report.scanners?.['dependency-health']?.uniqueDependencies || 0,
            unusedDependencies: depCounts['unused-dependency'] || 0,
            duplicateDependencies: depCounts['duplicate-dependency'] || 0,
            versionDrift: depCounts['version-drift'] || 0
        },
        'environment-variables': {
            ...(report.scanners?.['environment-variables'] || {}),
            missingKeys: envCounts['missing-env-key'] || 0,
            unusedKeys: envCounts['unused-env-key'] || 0,
            secretFindings: envCounts['env-secret'] || 0
        }
    };

    const unchangedTotal = Object.entries(findings)
        .filter(([key]) => !['configManagement', 'dependencyHealth', 'environmentVariables'].includes(key))
        .reduce((sum, [, bucket]) => sum + (bucket?.length || 0), 0);

    report.summary = {
        ...(report.summary || {}),
        configFindings: configFindings.length,
        dependencyFindings: dependencyFindings.length,
        environmentFindings: environmentFindings.length,
        totalFindings: unchangedTotal
            + configFindings.length
            + dependencyFindings.length
            + environmentFindings.length
    };

    if (Array.isArray(report.allFindings)) {
        report.allFindings = report.allFindings.filter((finding) => {
            const scanner = finding.scanner || '';
            if (!['config-management', 'dependency-health', 'environment-variables'].includes(scanner)) {
                return true;
            }
            return isWorkspacePath(finding.path);
        });
    }

    return report;
}

function enrichCleanupReport(report, options = {}) {
    if (!report || typeof report !== 'object') return report;

    const enriched = { ...report, findings: { ...(report.findings || {}) }, scanners: { ...(report.scanners || {}) } };
    const profile = options.profile || enriched.scanProfile || 'all';
    enriched.scanProfile = profile;

    if (profile === 'data-quality' || profile === 'all') {
        rebuildWorkspaceScopedSummaries(enriched);
    }

    const normalized = normalizeFileReductionReport(enriched);
    Object.assign(enriched, normalized);

    enriched.fileReductionPlan = buildFileReductionPlan(enriched);
    enriched.scannerStatistics = buildScannerStatistics(enriched);
    enriched.executiveSummary = buildExecutiveSummary(enriched);

    return enriched;
}

function slimFindingForClient(finding) {
    if (!finding || typeof finding !== 'object') return finding;
    const slim = {
        type: finding.type,
        category: finding.category,
        severity: finding.severity,
        path: finding.path,
        reason: finding.reason,
        message: finding.message,
        action: finding.action,
        sizeBytes: finding.sizeBytes,
        reclaimableBytes: finding.reclaimableBytes,
        scanner: finding.scanner,
        metadata: finding.metadata
    };
    if (finding.kind) slim.kind = finding.kind;
    if (finding.fileCount != null) slim.fileCount = finding.fileCount;
    if (finding.sizeEstimated) slim.sizeEstimated = finding.sizeEstimated;
    return slim;
}

function sliceFindings(list, limit) {
    return (list || []).slice(0, limit).map(slimFindingForClient);
}

/** Dashboard/API payload — keeps plans and summaries, drops multi-MB finding arrays. */
function compactDataCleanupReportForClient(report, options = {}) {
    if (!report || typeof report !== 'object') return report;
    const topFindingsLimit = options.topFindingsLimit ?? 24;
    const bucketLimit = options.bucketLimit ?? 12;
    const compact = {
        ...report,
        compact: true,
        findings: {
            buildArtifacts: sliceFindings(report.findings?.buildArtifacts, bucketLimit),
            assetConsolidation: sliceFindings(report.findings?.assetConsolidation, 8),
            unusedFiles: sliceFindings(report.findings?.unusedFiles, bucketLimit),
            configManagement: sliceFindings(report.findings?.configManagement, bucketLimit),
            dependencyHealth: sliceFindings(report.findings?.dependencyHealth, bucketLimit),
            environmentVariables: sliceFindings(report.findings?.environmentVariables, bucketLimit),
            dataFreshness: sliceFindings(report.findings?.dataFreshness, 8),
            dataAccessPatterns: sliceFindings(report.findings?.dataAccessPatterns, bucketLimit),
            dataPrivacy: sliceFindings(report.findings?.dataPrivacy, bucketLimit),
            dataLineage: sliceFindings(report.findings?.dataLineage, bucketLimit),
            dataConsistency: sliceFindings(report.findings?.dataConsistency, 8)
        },
        allFindings: (report.allFindings || []).slice(0, topFindingsLimit).map(slimFindingForClient)
    };
    if (options.note !== false) {
        compact.compactNote = 'Top findings only — counts and fileReductionPlan retain full scan totals.';
    }
    return compact;
}

module.exports = {
    enrichCleanupReport,
    compactDataCleanupReportForClient,
    rebuildWorkspaceScopedSummaries,
    filterWorkspaceFindings
};
