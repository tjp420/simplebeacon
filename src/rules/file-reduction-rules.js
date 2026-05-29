/**
 * Rule registration for file-reduction and data-quality scanners.
 */

const { BuildArtifactScanner } = require('../analyzers/file-reduction/build-artifact-scanner');
const { AssetConsolidationScanner } = require('../analyzers/file-reduction/asset-consolidation-scanner');
const { UnusedFileDetector } = require('../analyzers/file-reduction/unused-file-detector');
const {
    ConfigManagementAnalyzer,
    DependencyHealthAnalyzer,
    EnvironmentVariableAnalyzer,
    DataFreshnessAnalyzer,
    DataAccessPatternAnalyzer,
    DataPrivacyAnalyzer,
    DataLineageAnalyzer,
    DataConsistencyAnalyzer
} = require('../analyzers/data-cleanup');

module.exports = {
    id: 'file-reduction',
    name: 'File Reduction & Data Quality Analysis',
    version: '1.1.0',
    scanners: [
        { id: 'build-artifacts', class: BuildArtifactScanner, enabled: true, priority: 1 },
        { id: 'asset-consolidation', class: AssetConsolidationScanner, enabled: true, priority: 2 },
        { id: 'unused-files', class: UnusedFileDetector, enabled: true, priority: 3 },
        { id: 'config-management', class: ConfigManagementAnalyzer, enabled: true, priority: 4 },
        { id: 'dependency-health', class: DependencyHealthAnalyzer, enabled: true, priority: 5 },
        { id: 'environment-variables', class: EnvironmentVariableAnalyzer, enabled: true, priority: 6 },
        { id: 'data-freshness', class: DataFreshnessAnalyzer, enabled: true, priority: 7 },
        { id: 'data-access-patterns', class: DataAccessPatternAnalyzer, enabled: true, priority: 8 },
        { id: 'data-privacy', class: DataPrivacyAnalyzer, enabled: true, priority: 9 },
        { id: 'data-lineage', class: DataLineageAnalyzer, enabled: true, priority: 10 },
        { id: 'data-consistency', class: DataConsistencyAnalyzer, enabled: true, priority: 11 }
    ],
    severityMapping: {
        'build-artifact': 'low',
        'asset-duplicate': 'low',
        'unused-file': 'medium',
        'config-sprawl': 'medium',
        'env-secret': 'high',
        'unused-dependency': 'low',
        'version-drift': 'medium',
        'stale-data': 'low',
        'data-access-pattern': 'medium',
        'data-privacy': 'high',
        'orphaned-data': 'low',
        'data-shape-drift': 'medium'
    }
};
