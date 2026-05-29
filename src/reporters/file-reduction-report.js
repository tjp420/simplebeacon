/**
 * Markdown/JSON reporting for file-reduction findings.
 */

const { formatBytes } = require('../scan');

function generateSummary(report) {
    const summary = report.summary || {};
    const inventory = report.inventory || {};
    return [
        '# Data Cleanup Report',
        '',
        `Project: \`${report.projectRoot}\``,
        `Generated: ${report.generatedAt || new Date().toISOString()}`,
        `Mode: ${report.dryRun ? 'dry-run (no files deleted)' : 'live'}`,
        '',
        '## Summary',
        '',
        `- Files scanned: **${(inventory.totalFiles || 0).toLocaleString()}**`,
        `- Directories scanned: **${(inventory.totalDirectories || 0).toLocaleString()}**`,
        `- Total findings: **${summary.totalFindings || 0}**`,
        `- Build artifact hits: **${summary.buildArtifactFindings || 0}**`,
        `- Duplicate asset groups: **${summary.duplicateAssetGroups || 0}**`,
        `- Unused file candidates: **${summary.unusedFileCandidates || 0}**`,
        `- Config management findings: **${summary.configFindings || 0}**`,
        `- Dependency health findings: **${summary.dependencyFindings || 0}**`,
        `- Environment variable findings: **${summary.environmentFindings || 0}**`,
        `- Data freshness findings: **${summary.dataFreshnessFindings || 0}**`,
        `- Data access pattern findings: **${summary.dataAccessFindings || 0}**`,
        `- Data privacy findings: **${summary.dataPrivacyFindings || 0}**`,
        `- Orphaned data files: **${summary.dataLineageFindings || 0}**`,
        `- Data shape drift groups: **${summary.dataConsistencyFindings || 0}**`,
        `- Severity breakdown: **${report.aggregation?.bySeverity?.high || 0} high**, **${report.aggregation?.bySeverity?.medium || 0} medium**, **${report.aggregation?.bySeverity?.low || 0} low**`,
        `- Estimated reclaimable space: **${formatBytes(summary.reclaimableBytes || 0)}**`,
        `- Rough finding density: **${summary.estimatedReductionPct || 0}%** of scanned files flagged`,
        ''
    ].join('\n');
}

function generateBuildArtifactSection(findings = []) {
    const lines = ['## Build Artifacts', ''];
    if (!findings.length) {
        lines.push('_No build artifact directories or generated files detected._', '');
        return lines.join('\n');
    }
    lines.push('| Path | Reason | Files | Size | Action |');
    lines.push('| --- | --- | ---: | ---: | --- |');
    for (const finding of findings.slice(0, 100)) {
        lines.push(`| \`${finding.path}\` | ${finding.reason} | ${finding.fileCount || 1} | ${formatBytes(finding.sizeBytes || 0)} | ${finding.action} |`);
    }
    if (findings.length > 100) {
        lines.push('', `_…and ${findings.length - 100} more._`);
    }
    lines.push('');
    return lines.join('\n');
}

function generateAssetConsolidationSection(findings = []) {
    const lines = ['## Asset Consolidation', ''];
    if (!findings.length) {
        lines.push('_No duplicate asset groups detected._', '');
        return lines.join('\n');
    }
    for (const group of findings.slice(0, 50)) {
        lines.push(`### Hash \`${group.hash.slice(0, 12)}…\``);
        lines.push(`- Keeper: \`${group.keeper}\``);
        lines.push(`- Duplicates: ${group.duplicates.map((p) => `\`${p}\``).join(', ')}`);
        lines.push(`- Reclaimable: ${formatBytes(group.reclaimableBytes || 0)}`, '');
    }
    if (findings.length > 50) {
        lines.push(`_…and ${findings.length - 50} more duplicate groups._`, '');
    }
    return lines.join('\n');
}

function generateUnusedFileSection(findings = [], entryPoints = []) {
    const lines = ['## Unused File Candidates', ''];
    if (entryPoints.length) {
        lines.push(`Entry points preserved: ${entryPoints.map((p) => `\`${p}\``).join(', ')}`, '');
    }
    if (!findings.length) {
        lines.push('_No unused file candidates detected._', '');
        return lines.join('\n');
    }
    lines.push('| Path | Reason | Confidence | Action |');
    lines.push('| --- | --- | --- | --- |');
    for (const finding of findings.slice(0, 100)) {
        lines.push(`| \`${finding.path}\` | ${finding.reason} | ${finding.confidence} | ${finding.action} |`);
    }
    if (findings.length > 100) {
        lines.push('', `_…and ${findings.length - 100} more._`);
    }
    lines.push('');
    return lines.join('\n');
}

function generateGenericFindingSection(title, findings = [], columns = ['Path', 'Reason', 'Severity', 'Action']) {
    const lines = [`## ${title}`, ''];
    if (!findings.length) {
        lines.push(`_No ${title.toLowerCase()} findings._`, '');
        return lines.join('\n');
    }
    lines.push(`| ${columns.join(' | ')} |`);
    lines.push(`| ${columns.map(() => '---').join(' | ')} |`);
    for (const finding of findings.slice(0, 100)) {
        lines.push(`| \`${finding.path}\` | ${finding.reason} | ${finding.severity || 'low'} | ${finding.action} |`);
    }
    if (findings.length > 100) {
        lines.push('', `_…and ${findings.length - 100} more._`);
    }
    lines.push('');
    return lines.join('\n');
}

function generateRecommendations(_report) {
    return [
        '## Recommendations',
        '',
        '1. Start with **build artifact** directories (`node_modules`, `dist`, `coverage`) — highest confidence.',
        '2. Consolidate **duplicate assets** by keeping one canonical copy and updating references.',
        '3. Review **unused file** candidates manually — static analysis cannot detect dynamic imports or runtime loaders.',
        '4. Align **environment variables** and remove unused keys after verifying deployment docs.',
        '5. Refresh **stale mock/sample data** flagged by freshness and lineage scans.',
        '6. Fix **sync I/O in routes/loops** flagged by data access pattern analysis.',
        '7. Remove **PII and secrets** from mock data files before sharing exports.',
        '8. Resolve **dependency version drift** across workspace package.json files before removing unused deps.',
        '9. Re-run `npx simplebeacon reduce` after cleanup to measure progress.',
        '',
        '> This report is advisory. Nothing is deleted unless you act on findings manually.',
        ''
    ].join('\n');
}

function generateFileReductionReport(report, options = {}) {
    const findings = report.findings || {};
    const sections = [
        generateSummary(report),
        generateBuildArtifactSection(findings.buildArtifacts),
        generateAssetConsolidationSection(findings.assetConsolidation),
        generateUnusedFileSection(findings.unusedFiles, report.metadata?.entryPoints || []),
        generateGenericFindingSection('Configuration Management', findings.configManagement),
        generateGenericFindingSection('Dependency Health', findings.dependencyHealth),
        generateGenericFindingSection('Environment Variables', findings.environmentVariables),
        generateGenericFindingSection('Data Freshness', findings.dataFreshness),
        generateGenericFindingSection('Data Access Patterns', findings.dataAccessPatterns),
        generateGenericFindingSection('Data Privacy', findings.dataPrivacy),
        generateGenericFindingSection('Data Lineage (Orphaned Data)', findings.dataLineage),
        generateGenericFindingSection('Data Consistency', findings.dataConsistency),
        generateRecommendations(report)
    ];
    const markdown = sections.join('\n');
    if (options.format === 'json') {
        return JSON.stringify(report, null, 2);
    }
    return markdown;
}

module.exports = {
    generateFileReductionReport,
    generateSummary,
    generateBuildArtifactSection,
    generateAssetConsolidationSection,
    generateUnusedFileSection,
    generateRecommendations
};
