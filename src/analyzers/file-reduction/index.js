/**
 * File reduction + data cleanup analyzers.
 */

const { walkProjectFiles } = require('./utils/project-walker');
const fileReductionRules = require('../../rules/file-reduction-rules');
const { aggregateCleanupFindings } = require('../../lib/result-aggregator');
const { buildExecutiveSummary } = require('../../lib/executive-summary');
const { buildScannerStatistics } = require('../../lib/scanner-statistics');
const { buildFileReductionPlan } = require('../../lib/file-reduction-plan');
const { loadSimplebeaconConfig } = require('../../config');
const { crossReferenceScannerResults } = require('../../lib/cross-analyzer-intelligence');

const DEFAULT_SCANNERS = fileReductionRules.scanners.map((entry) => ({
    id: entry.id,
    Scanner: entry.class,
    enabled: entry.enabled !== false,
    priority: entry.priority
}));

async function runFileReductionAnalysis(projectRoot, options = {}) {
    const startedAt = Date.now();
    const inventory = await walkProjectFiles(projectRoot, options);
    const scannerConfig = options.scanners || {};
    let dataCleanupConfig = {};
    try {
        const loaded = loadSimplebeaconConfig(projectRoot);
        dataCleanupConfig = loaded.config?.dataCleanup || {};
    } catch {
        dataCleanupConfig = {};
    }
    const hasExplicitScannerConfig = Object.keys(scannerConfig).length > 0;
    const enabledScanners = DEFAULT_SCANNERS
        .filter((entry) => {
            if (!hasExplicitScannerConfig) {
                return entry.enabled !== false;
            }
            return scannerConfig[entry.id]?.enabled === true;
        })
        .sort((a, b) => a.priority - b.priority);

    const results = {};
    for (const entry of enabledScanners) {
        const scannerOptions = {
            ...(dataCleanupConfig[entry.id] || {}),
            ...(scannerConfig[entry.id] || {})
        };
        const scanner = new entry.Scanner(scannerOptions);
        results[entry.id] = await scanner.scan(projectRoot, { ...options, inventory });
    }

    crossReferenceScannerResults(results);

    const rawFindings = Object.values(results).flatMap((result) => result.findings || []);
    const aggregated = aggregateCleanupFindings(rawFindings);
    const allFindings = aggregated.findings;

    const reclaimableBytes = allFindings.reduce((sum, finding) => {
        if (finding.reclaimableBytes) return sum + finding.reclaimableBytes;
        if (finding.type === 'build-artifact') return sum + (finding.sizeBytes || 0);
        return sum;
    }, 0);

    const report = {
        type: 'data-cleanup-report',
        projectRoot,
        dryRun: options.dryRun !== false,
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        inventory: {
            totalFiles: inventory.files.length,
            totalDirectories: inventory.directories.length
        },
        scanners: Object.fromEntries(
            Object.entries(results).map(([id, result]) => [id, result.summary || {}])
        ),
        findings: {
            buildArtifacts: results['build-artifacts']?.findings || [],
            assetConsolidation: results['asset-consolidation']?.findings || [],
            unusedFiles: results['unused-files']?.findings || [],
            configManagement: results['config-management']?.findings || [],
            dependencyHealth: results['dependency-health']?.findings || [],
            environmentVariables: results['environment-variables']?.findings || [],
            dataFreshness: results['data-freshness']?.findings || [],
            dataAccessPatterns: results['data-access-patterns']?.findings || [],
            dataPrivacy: results['data-privacy']?.findings || [],
            dataLineage: results['data-lineage']?.findings || [],
            dataConsistency: results['data-consistency']?.findings || []
        },
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
        allFindings,
        summary: {
            totalFindings: allFindings.length,
            buildArtifactFindings: (results['build-artifacts']?.findings || []).length,
            duplicateAssetGroups: (results['asset-consolidation']?.findings || []).length,
            unusedFileCandidates: (results['unused-files']?.findings || []).length,
            configFindings: (results['config-management']?.findings || []).length,
            dependencyFindings: (results['dependency-health']?.findings || []).length,
            environmentFindings: (results['environment-variables']?.findings || []).length,
            dataFreshnessFindings: (results['data-freshness']?.findings || []).length,
            dataAccessFindings: (results['data-access-patterns']?.findings || []).length,
            dataPrivacyFindings: (results['data-privacy']?.findings || []).length,
            dataLineageFindings: (results['data-lineage']?.findings || []).length,
            dataConsistencyFindings: (results['data-consistency']?.findings || []).length,
            reclaimableBytes,
            estimatedReductionPct: inventory.files.length
                ? Math.round((allFindings.length / inventory.files.length) * 1000) / 10
                : 0
        },
        metadata: {
            entryPoints: results['unused-files']?.metadata?.entryPoints || [],
            dataLineage: results['data-lineage']?.metadata?.lineage || []
        }
    };
    report.fileReductionPlan = buildFileReductionPlan(report);
    report.executiveSummary = buildExecutiveSummary(report);
    report.scannerStatistics = buildScannerStatistics(report);
    return report;
}

module.exports = {
    runFileReductionAnalysis,
    DEFAULT_SCANNERS,
    fileReductionRules,
    BuildArtifactScanner: fileReductionRules.scanners.find((s) => s.id === 'build-artifacts').class,
    AssetConsolidationScanner: fileReductionRules.scanners.find((s) => s.id === 'asset-consolidation').class,
    UnusedFileDetector: fileReductionRules.scanners.find((s) => s.id === 'unused-files').class,
    walkProjectFiles
};
