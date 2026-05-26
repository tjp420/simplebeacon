/**
 * Expected shape for each self-contained dashboard page sample JSON.
 */
const PAGE_SAMPLE_SPECS = {
    'ai-analysis-sample.json': {
        type: 'ai-analysis-model',
        overviewKeys: ['issuesFound'],
        topLevelKeys: ['codeQuality', 'security', 'performance'],
        arrayKeys: ['severityBreakdown', 'categories', 'issues', 'recommendations', 'activity'],
        objectKeys: ['patterns'],
        allowEmptyArrays: ['severityBreakdown', 'issues']
    },
    'ai-roadmap-sample.json': {
        type: 'ai-roadmap-report-model',
        topLevelKeys: ['projectOverview'],
        nestedChecks: [{ path: ['projectOverview', 'projectName'] }],
        arrayKeys: ['developmentPhases', 'predictions', 'risks', 'actionPlan', 'performanceMetrics'],
        objectKeys: ['recommendations']
    },
    'local-models-sample.json': {
        type: 'local-models-model',
        overviewKeys: ['totalModels'],
        arrayKeys: ['providers']
    },
    'ai-tools-sample.json': {
        type: 'ai-tools-model',
        overviewKeys: ['totalTools'],
        arrayKeys: ['tools', 'usageByCategory', 'performanceMetrics', 'insights', 'activity']
    },
    'analytics-sample.json': {
        type: 'analytics-model',
        overviewKeys: ['apiCalls'],
        arrayKeys: ['usageByCategory']
    },
    'dashboard-home-sample.json': {
        type: 'dashboard-home-model',
        topLevelKeys: ['overview', 'chart'],
        nestedChecks: [{ path: ['overview', 'totalFiles'] }],
        objectKeys: ['chart']
    },
    'api-sample.json': {
        type: 'api-model',
        overviewKeys: ['totalAPIs'],
        arrayKeys: ['apis']
    },
    'code-generation-sample.json': {
        type: 'code-generation-model',
        topLevelKeys: ['stats'],
        nestedChecks: [{ path: ['stats', 'totalGenerated'] }],
        arrayKeys: ['templates', 'history', 'languages', 'insights']
    },
    'database-sample.json': {
        type: 'database-model',
        overviewKeys: ['connectedDatabases'],
        arrayKeys: ['databases']
    },
    'debt-reduction-sample.json': {
        type: 'debt-reduction-model',
        overviewKeys: ['debtReduction'],
        arrayKeys: ['strategies', 'activeTasks']
    },
    'debt-analytics-sample.json': {
        type: 'debt-analytics-model',
        overviewKeys: ['totalDebt'],
        objectKeys: ['trends', 'predictions', 'kpis'],
        arrayKeys: ['reports', 'insights', 'alerts']
    },
    'feature-backlog-sample.json': {
        type: 'feature-backlog-report',
        topLevelKeys: ['featureStatistics'],
        nestedChecks: [{ path: ['featureStatistics', 'totalFeatures'] }],
        arrayKeys: ['featureCategories', 'currentSprintBacklog', 'upcomingFeatures', 'recommendations']
    },
    'release-timeline-sample.json': {
        type: 'release-timeline-report',
        topLevelKeys: ['releaseOverview'],
        nestedChecks: [{ path: ['releaseOverview', 'totalReleases'] }],
        arrayKeys: ['releaseSchedule', 'recommendations']
    },
    'billing-system-sample.json': {
        type: 'billing-system-model',
        overviewKeys: ['totalRevenue'],
        arrayKeys: ['subscriptions', 'recentTransactions', 'invoices', 'metrics', 'alerts']
    },
    'project-reports-sample.json': {
        type: 'project-reports-model',
        overviewKeys: ['totalReports'],
        arrayKeys: ['reports', 'projects', 'templates', 'recentActivity']
    },
    'assets-library-sample.json': {
        type: 'assets-library-model',
        overviewKeys: ['totalAssets'],
        arrayKeys: ['assets', 'categories', 'collections', 'recentActivity']
    },
    'code-templates-sample.json': {
        type: 'code-templates-model',
        overviewKeys: ['totalSnippets'],
        arrayKeys: ['templates', 'categories', 'languages', 'snippets', 'recentActivity']
    },
    'coverage-reports-sample.json': {
        type: 'coverage-reports-model',
        overviewKeys: ['overallCoverage'],
        arrayKeys: ['projects', 'coverageTrends', 'uncoveredFiles', 'recommendations', 'recentRuns', 'coverageGoals']
    },
    'settings-sample.json': {
        type: 'settings-model',
        overviewKeys: ['totalUsers'],
        topLevelKeys: ['userSettings', 'systemSettings', 'adminSettings'],
        arrayKeys: ['systemHealth', 'recentActivity']
    },
    'help-sample.json': {
        type: 'help-model',
        overviewKeys: ['totalDocs'],
        arrayKeys: ['quickLinks', 'documentation', 'tutorials', 'faq', 'popularContent', 'recentUpdates']
    },
    'simplebeacon-cli-dashboard-sample.json': {
        type: 'simplebeacon-cli-model',
        overviewKeys: ['totalItems'],
        arrayKeys: ['items', 'commands', 'rules']
    },
    'implementation-plan-sample.json': {
        type: 'implementation-plan-model',
        topLevelKeys: ['executiveSummary'],
        nestedChecks: [{ path: ['executiveSummary', 'currentCompletion'] }],
        arrayKeys: ['implementationPhases', 'riskManagement', 'milestones', 'immediateActions'],
        objectKeys: ['successMetrics', 'resourceAllocation']
    },
    'debt-calculator-sample.json': {
        type: 'debt-calculator-model',
        overviewKeys: ['debtScore'],
        arrayKeys: ['categories']
    },
    'dev-tools-sample.json': {
        type: 'dev-tools-model',
        overviewKeys: ['totalTools'],
        arrayKeys: ['tools', 'workflows']
    },
    'merger-tool-sample.json': {
        type: 'merger-tool-model',
        overviewKeys: ['totalMerges'],
        arrayKeys: ['merges'],
        objectKeys: ['reductionScan'],
        allowEmptyArrays: ['merges']
    },
    'gguf-mock-analysis-sample.json': {
        type: 'gguf-mock-data-analysis-report',
        topLevelKeys: ['analysisOverview'],
        nestedChecks: [{ path: ['analysisOverview', 'issuesDetected'] }],
        arrayKeys: ['mockDataCategories', 'detectedIssues'],
        objectKeys: ['qualityMetrics', 'ggufAIInsights', 'performanceMetrics', 'privacyAndSecurity'],
        allowEmptyArrays: ['detectedIssues']
    },
    'issue-resolution-sample.json': {
        type: 'issue-resolution-model',
        topLevelKeys: ['total', 'resolvedPct'],
        arrayKeys: ['categories', 'issues', 'insights'],
        objectKeys: ['quality'],
        allowEmptyArrays: ['categories', 'issues']
    },
    'performance-sample.json': {
        type: 'performance-model',
        overviewKeys: ['cpuCurrent'],
        objectKeys: ['metricsTimeline']
    },
    'quality-dashboard-sample.json': {
        type: 'quality-dashboard-model',
        overviewKeys: ['issuesFound'],
        arrayKeys: ['metrics', 'alerts']
    },
    'security-dashboard-sample.json': {
        type: 'security-dashboard-model',
        overviewKeys: ['activeThreats'],
        arrayKeys: ['threats', 'vulnerabilities'],
        allowEmptyArrays: ['threats']
    },
    'support-dashboard-sample.json': {
        type: 'support-dashboard-model',
        overviewKeys: ['openTickets'],
        arrayKeys: ['tickets', 'agents']
    },
    'reports-sample.json': {
        type: 'reports-model',
        overviewKeys: ['totalReports'],
        arrayKeys: ['reports']
    },
    'roadmap-comparison-sample.json': {
        type: 'roadmap-comparison-report',
        topLevelKeys: ['ggufReport', 'aiReport', 'differences'],
        nestedChecks: [
            { path: ['differences', 'completionRate'] },
            { path: ['visualComparison', 'summary'] }
        ],
        arrayKeys: ['insights', 'recommendations'],
        objectKeys: ['visualComparison']
    },
    'engineering-baseline-sample.json': {
        type: 'engineering-baseline-report',
        topLevelKeys: ['overview', 'fictionVsReality', 'releaseMilestones'],
        nestedChecks: [{ path: ['overview', 'currentRelease'] }],
        arrayKeys: ['criticalPath', 'successMetrics'],
        objectKeys: ['riskAssessment', 'budgetEstimate', 'recommendations']
    },
    'data-maintenance-analyzers-sample.json': {
        type: 'data-maintenance-analyzers-report',
        topLevelKeys: ['overview', 'currentCapabilities', 'analyzerRoadmap'],
        nestedChecks: [{ path: ['overview', 'openIssues'] }],
        arrayKeys: ['currentCapabilities', 'analyzerRoadmap', 'implementationPhases'],
        objectKeys: ['priorityMatrix', 'expectedImpact', 'rejectedFiction']
    },
    'cascade-roadmap-sample.json': {
        topLevelKeys: ['roadmap', 'dataSource'],
        nestedChecks: [
            { path: ['roadmap', 'executiveSummary'] },
            { path: ['roadmap', 'developmentPhases'] }
        ],
        arrayKeys: [],
        objectKeys: ['roadmap']
    },
    'gguf-roadmap-sample.json': {
        type: 'gguf-development-roadmap-report',
        topLevelKeys: ['projectOverview', 'developmentPhases', 'dataSource'],
        arrayKeys: ['developmentPhases'],
        requireRepositoryAudit: true
    },
    'master-roadmap-sample.json': {
        topLevelKeys: ['overview', 'sources', 'dataSource'],
        nestedChecks: [{ path: ['overview', 'sampleJsonFiles'] }],
        arrayKeys: ['sources'],
        objectKeys: ['overview'],
        optionalObjectKeys: ['deprecatedNarrative']
    },
    'fictional-patterns-sample.json': {
        type: 'fictional-patterns-report',
        overviewKeys: ['totalPatterns'],
        arrayKeys: ['patterns']
    },
    'ai-quality-metrics-sample.json': {
        type: 'ai-quality-metrics-report',
        overviewKeys: ['qualityScore'],
        topLevelKeys: ['currentScore', 'metrics'],
        arrayKeys: ['metrics']
    },
    'baseline-comparison-sample.json': {
        type: 'baseline-comparison-report',
        topLevelKeys: ['baselineType', 'baselineValue', 'currentValue', 'variance', 'status'],
        overviewKeys: ['compliance'],
        arrayKeys: ['comparisons']
    },
    'ai-adoption-trends-sample.json': {
        type: 'ai-adoption-trends-report',
        overviewKeys: ['totalScans'],
        arrayKeys: ['trends']
    },
    'simplebeacon-cli-sample.json': {
        type: 'simplebeacon-cli-model',
        topLevelKeys: ['overview', 'items', 'commands', 'rules'],
        arrayKeys: ['items', 'commands', 'rules']
    }
};

const ROADMAP_SAMPLES = [
    'cascade-roadmap-sample.json',
    'gguf-roadmap-sample.json',
    'master-roadmap-sample.json'
];

module.exports = { PAGE_SAMPLE_SPECS, ROADMAP_SAMPLES };
