/**
 * Data cleanup + data quality analyzers.
 */

const { ConfigManagementAnalyzer } = require('./config-management-analyzer');
const { DependencyHealthAnalyzer } = require('./dependency-health-analyzer');
const { EnvironmentVariableAnalyzer } = require('./environment-variable-analyzer');
const { DataFreshnessAnalyzer } = require('./data-freshness-analyzer');
const { DataAccessPatternAnalyzer } = require('./data-access-pattern-analyzer');
const { DataPrivacyAnalyzer } = require('./data-privacy-analyzer');
const { DataLineageAnalyzer } = require('./data-lineage-analyzer');
const { DataConsistencyAnalyzer } = require('./data-consistency-analyzer');

const DATA_CLEANUP_SCANNERS = [
    { id: 'config-management', Scanner: ConfigManagementAnalyzer, enabled: true, priority: 4 },
    { id: 'dependency-health', Scanner: DependencyHealthAnalyzer, enabled: true, priority: 5 },
    { id: 'environment-variables', Scanner: EnvironmentVariableAnalyzer, enabled: true, priority: 6 },
    { id: 'data-freshness', Scanner: DataFreshnessAnalyzer, enabled: true, priority: 7 },
    { id: 'data-access-patterns', Scanner: DataAccessPatternAnalyzer, enabled: true, priority: 8 },
    { id: 'data-privacy', Scanner: DataPrivacyAnalyzer, enabled: true, priority: 9 },
    { id: 'data-lineage', Scanner: DataLineageAnalyzer, enabled: true, priority: 10 },
    { id: 'data-consistency', Scanner: DataConsistencyAnalyzer, enabled: true, priority: 11 }
];

module.exports = {
    DATA_CLEANUP_SCANNERS,
    ConfigManagementAnalyzer,
    DependencyHealthAnalyzer,
    EnvironmentVariableAnalyzer,
    DataFreshnessAnalyzer,
    DataAccessPatternAnalyzer,
    DataPrivacyAnalyzer,
    DataLineageAnalyzer,
    DataConsistencyAnalyzer
};
