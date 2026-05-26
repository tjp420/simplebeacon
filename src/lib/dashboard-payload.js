/**
 * Aggregate Simplebeacon report + history + baseline for dashboard surfaces.
 */

const {
    buildFictionPatternCatalog,
    countFictionIssues,
    mapFictionIssuesForResults
} = require('../rules/ai-fiction-detection');

function formatRelativeTime(isoString) {
    if (!isoString) return 'Never';
    const diff = Date.now() - new Date(isoString).getTime();
    if (Number.isNaN(diff)) return 'Never';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

function buildTrendSeries(history, key, limit = 5) {
    return (history || []).slice(-limit).map((entry) => entry[key] ?? 0);
}

function resolveBaselineStatus(report = {}, baseline = {}) {
    const current = report.consistencyScore ?? report.qualityScore ?? 0;
    const target = 100;
    const variance = Math.max(0, target - current);
    let status = 'pass';
    if (variance > 15) status = 'fail';
    else if (variance > 5) status = 'warning';

    return {
        compliance: `${current}%`,
        variance: variance === 0 ? '0% from baseline' : `-${variance}% from baseline`,
        status,
        consistencyScore: report.consistencyScore ?? null,
        pageSamplesLabel: baseline.pageSamplesLabel ?? null,
        jestTestsLabel: baseline.jestTestsLabel ?? null,
        gatePass: report.gate?.pass ?? false
    };
}

function resolveFilesAnalyzed(report = {}) {
    if (report.repositoryFilesTotal != null) return report.repositoryFilesTotal;
    if (report.repositoryInventory?.totalFiles != null) return report.repositoryInventory.totalFiles;
    return report.ruleScopedFilesAnalyzed ?? report.filesAnalyzed ?? Math.max(
        report.totalFiles ?? 0,
        report.credentialScanned ?? 0,
        report.productionLeakScanned ?? 0
    );
}

function buildDashboardPayload({ report, baseline, history, fictionCatalog }) {
    const catalog = fictionCatalog || buildFictionPatternCatalog(baseline);
    const entries = Array.isArray(history) ? history : [];
    const lastEntry = entries[entries.length - 1] || {};
    const fictionFound = countFictionIssues(report);

    const adoptionTrend = entries.slice(-5).map((entry) => entry.totalFilesScanned ?? resolveFilesAnalyzed(report));

    return {
        type: 'simplebeacon-dashboard',
        generatedAt: new Date().toISOString(),
        scanStatus: {
            lastScan: report.generatedAt || lastEntry.date || null,
            lastScanRelative: formatRelativeTime(report.generatedAt || lastEntry.date),
            scanId: lastEntry.scanId || null,
            totalScans: entries.length,
            fictionalPatterns: fictionFound,
            knownFictionPatterns: catalog.length,
            qualityScore: report.qualityScore ?? lastEntry.qualityScore ?? 0,
            consistencyScore: report.consistencyScore ?? report.schemaCompliance ?? null,
            mockSampleFiles: report.mockSampleFiles ?? report.totalFiles ?? null,
            gatePass: report.gate?.pass ?? lastEntry.gatePass ?? false,
            issueCount: report.issueCount ?? lastEntry.issueCount ?? 0,
            totalFilesScanned: resolveFilesAnalyzed(report) || lastEntry.totalFilesScanned || 0
        },
        trends: {
            fictionalPatternsTrend: buildTrendSeries(entries, 'fictionPatternsFound', 5),
            qualityScoreTrend: buildTrendSeries(entries, 'qualityScore', 5),
            aiAdoptionTrend: adoptionTrend
        },
        baselineStatus: resolveBaselineStatus(report, baseline),
        fictionCatalog: catalog
    };
}

function buildScanResults(report, historyEntry = {}, baseline = {}) {
    const fictionFound = historyEntry.fictionPatternsFound ?? countFictionIssues(report);
    const complianceScore = report.consistencyScore ?? report.qualityScore ?? 0;

    return {
        scanId: historyEntry.scanId || null,
        status: 'completed',
        scanTimestamp: historyEntry.date || report.generatedAt || null,
        results: {
            fictionalPatternsFound: fictionFound,
            qualityScore: historyEntry.qualityScore ?? report.qualityScore ?? 0,
            baselineCompliance: complianceScore >= 95 && (report.gate?.pass ?? historyEntry.gatePass ?? false),
            totalFilesScanned: historyEntry.totalFilesScanned ?? resolveFilesAnalyzed(report),
            issueCount: historyEntry.issueCount ?? report.issueCount ?? 0,
            gatePass: historyEntry.gatePass ?? report.gate?.pass ?? false,
            severityCounts: historyEntry.severityCounts || report.severityCounts || {},
            issues: mapFictionIssuesForResults(report),
            knownPatterns: buildFictionPatternCatalog(baseline)
        }
    };
}

function findHistoryEntry(history, scanId) {
    const entries = Array.isArray(history) ? history : [];
    if (!entries.length) return null;

    if (!scanId || scanId === 'latest') {
        return entries[entries.length - 1];
    }

    const byId = entries.find((entry) => entry.scanId === scanId);
    if (byId) return byId;

    const byDate = entries.find((entry) => entry.date === scanId);
    if (byDate) return byDate;

    return null;
}

function buildAuditLayers(report = {}, baseline = {}) {
    const sev = report.severityCounts || { high: 0, medium: 0, low: 0 };
    const raw = report.rawIssues || report.detectedIssues || [];

    const countByType = (pattern) =>
        raw.filter((issue) => pattern.test(String(issue.type)))
            .reduce((sum, issue) => sum + (issue.count || 1), 0);

    return {
        credentials: {
            enabled: true,
            scanned: report.credentialScanned ?? 0,
            findings: report.credentialFindings ?? countByType(/credential/i),
            severity: 'high',
            status: (report.credentialFindings ?? 0) === 0 ? 'pass' : 'fail'
        },
        fictionKpis: {
            enabled: true,
            scanned: report.consistencyChecked ?? 0,
            findings: countFictionIssues(report),
            knownPatterns: (buildFictionPatternCatalog(baseline) || []).length,
            severity: 'high',
            status: countFictionIssues(report) === 0 ? 'pass' : 'fail'
        },
        schema: {
            enabled: true,
            checked: report.schemaChecked ?? 0,
            passed: report.schemaPassed ?? 0,
            pageSamplesChecked: report.pageSampleSchemaChecked ?? 0,
            pageSamplesPassed: report.pageSampleSchemaPassed ?? 0,
            compliance: report.schemaCompliance ?? null,
            severity: 'high',
            status: (report.schemaPassed ?? 0) >= (report.schemaChecked ?? 0) ? 'pass' : 'fail'
        },
        productionLeaks: {
            enabled: true,
            scanned: report.productionLeakScanned ?? 0,
            findings: report.productionLeakFindings ?? countByType(/production leak/i),
            severity: 'medium',
            status: (report.productionLeakFindings ?? 0) === 0 ? 'pass' : 'warn'
        },
        roadmap: {
            enabled: true,
            checked: report.roadmapSchemaChecked ?? 0,
            passed: report.roadmapSchemaPassed ?? 0,
            duplicateGroups: report.duplicateGroups ?? 0,
            severity: 'medium',
            status: (report.duplicateGroups ?? 0) === 0 ? 'pass' : 'warn'
        },
        jestBaseline: {
            enabled: Boolean(baseline.jestTestsLabel),
            label: baseline.jestTestsLabel ?? null,
            suites: baseline.jestSuites ?? null,
            severity: 'medium',
            status: 'pass'
        },
        gate: {
            pass: report.gate?.pass ?? false,
            failOn: report.gate?.failOn ?? ['high'],
            blockingCount: report.gate?.blockingCount ?? sev.high ?? 0,
            severityCounts: sev
        }
    };
}

function buildAuditPayload(context, extras = {}) {
    const { report, baseline, history, fictionCatalog } = context;
    const dashboard = buildDashboardPayload(context);

    return {
        type: 'simplebeacon-audit-report',
        generatedAt: new Date().toISOString(),
        generatedBy: 'Simplebeacon',
        dashboard,
        report: {
            generatedAt: report.generatedAt,
            qualityScore: report.qualityScore,
            consistencyScore: report.consistencyScore,
            schemaCompliance: report.schemaCompliance,
            totalFiles: resolveFilesAnalyzed(report),
            mockSampleFiles: report.mockSampleFiles ?? report.totalFiles,
            filesAnalyzed: report.filesAnalyzed,
            pageSampleSchemaChecked: report.pageSampleSchemaChecked,
            pageSampleSchemaPassed: report.pageSampleSchemaPassed,
            schemaChecked: report.schemaChecked,
            schemaPassed: report.schemaPassed,
            repositoryInventory: report.repositoryInventory ?? null,
            issueCount: report.issueCount,
            gate: report.gate
        },
        baseline: {
            pageSamplesLabel: report.pageSampleSchemaChecked != null
                ? `${report.pageSampleSchemaPassed ?? 0}/${report.pageSampleSchemaChecked}`
                : baseline.pageSamplesLabel,
            jestTestsLabel: baseline.jestTestsLabel,
            dataSource: baseline.dataSource,
            currentRelease: baseline.currentRelease
        },
        fictionCatalog: fictionCatalog || buildFictionPatternCatalog(baseline),
        auditLayers: buildAuditLayers(report, baseline),
        assessment: extras.assessment || null,
        npmAudit: extras.npmAudit || null,
        pageSamples: extras.pageSamples || null,
        historyLength: Array.isArray(history) ? history.length : 0
    };
}

module.exports = {
    buildDashboardPayload,
    buildScanResults,
    buildAuditPayload,
    buildAuditLayers,
    findHistoryEntry,
    formatRelativeTime,
    resolveBaselineStatus
};
