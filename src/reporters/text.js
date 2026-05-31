/**
 * Text reporter for simplebeacon scan results.
 */

const { liabilityMetrics } = require('../lib/liability-metrics');

const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m'
};

function colorEnabled() {
    if (process.env.NO_COLOR != null) return false;
    if (process.env.FORCE_COLOR === '0') return false;
    return process.stdout.isTTY === true;
}

function paint(text, color) {
    if (!colorEnabled()) return text;
    return `${COLORS[color] || ''}${text}${COLORS.reset}`;
}

function severityColor(severity) {
    if (severity === 'critical') return 'red';
    if (severity === 'high') return 'red';
    if (severity === 'medium') return 'yellow';
    return 'dim';
}

function formatLiabilityReportCard(report, gateResult) {
    const metrics = liabilityMetrics(report, gateResult);
    const lines = [];
    lines.push(paint('Corporate liability snapshot (local smoke detector)', 'cyan'));
    lines.push('--------------------------------------------------------');
    lines.push(`AI slop pattern hits: ${metrics.slopHits}${metrics.slopFiles ? ` across ${metrics.slopFiles} file(s)` : ''}`);
    lines.push(`Mock / sample path signals: ${metrics.mockPathHits}${metrics.mockSampleFiles ? ` · ${metrics.mockSampleFiles} mock/sample file(s) in scope` : ''}`);
    lines.push(`Fiction KPI / placeholder findings: ${metrics.fictionKpis + metrics.placeholderHits}`);
    lines.push(`Production leak signals: ${metrics.productionLeaks}`);
    lines.push(`Un-audited AI artifacts (estimate): ${paint(String(metrics.unauditedArtifacts), metrics.unauditedArtifacts > 0 ? 'red' : 'green')}`);
    if (metrics.qualityScore != null) {
        lines.push(`Quality score: ${metrics.qualityScore}/100`);
    }
    if (gateResult) {
        lines.push(gateResult.pass
            ? paint('Merge gate: PASS (local rules only — not a legal attestation)', 'green')
            : paint(`Merge gate: FAIL — ${metrics.blockingCount} blocking issue(s) would stop CI`, 'red'));
    }
    lines.push('');
    return lines;
}

function formatEnterpriseUpsell(metrics) {
    const count = metrics.unauditedArtifacts;
    const noun = count === 1 ? 'artifact' : 'artifacts';
    return [
        paint('[!] Corporate Liability Firewall', 'yellow'),
        count > 0
            ? `Found ${count} un-audited AI ${noun} in this repository.`
            : 'No unaudited AI artifacts detected in this scan — ledger upload still records human-oversight evidence.',
        'To append an immutable cryptographic ledger block and export audit-ready documentation for your CRO, run:',
        paint('  simplebeacon upload --tier=enterprise --api-token sb_…', 'cyan'),
        `Dashboard: ${process.env.SIMPLEBEACON_APP_URL || 'https://simplebeacon.ai'}/app#/compliance-trail`
    ].join('\n');
}

function formatTextReport(report, gateResult = null, options = {}) {
    const lines = [];
    lines.push(paint('Simplebeacon', 'cyan'));
    lines.push('==================');
    lines.push(`Root: ${report.projectRoot}`);
    if (report.repositoryFilesTotal != null) {
        lines.push(`Repository files: ${report.repositoryFilesTotal.toLocaleString()}`);
    }
    lines.push(`Gate rules checked: ${report.ruleScopedFilesAnalyzed ?? report.filesAnalyzed ?? report.totalFiles} files`);
    lines.push('');

    lines.push(...formatLiabilityReportCard(report, gateResult));

    const counts = report.severityCounts || {};
    lines.push(
        `${paint('Critical', 'red')}: ${counts.critical || 0}  `
        + `${paint('High', 'red')}: ${counts.high || 0}  `
        + `${paint('Medium', 'yellow')}: ${counts.medium || 0}  `
        + `${paint('Low', 'dim')}: ${counts.low || 0}`
    );
    if (report.productionLeakScanned != null) {
        lines.push(`Production files scanned: ${report.productionLeakScanned} (${report.productionLeakFindings || 0} leak(s))`);
    }
    if (report.credentialScanned != null) {
        lines.push(`Credential files scanned: ${report.credentialScanned} (${report.credentialFindings || 0} finding(s))`);
    }
    if (report.jestBaselineChecked) {
        lines.push(`Jest baseline: ${report.jestBaselinePassed ? paint('PASS', 'green') : paint('FAIL', 'red')}`);
    }
    lines.push('');

    const issues = report.rawIssues || [];
    if (issues.length === 0) {
        lines.push(paint('No rule violations detected.', 'green'));
    } else {
        lines.push('Top findings:');
        for (const issue of issues.slice(0, 50)) {
            const label = `[${issue.severity}] ${issue.type}`;
            lines.push(`  ${paint(label, severityColor(issue.severity))}: ${issue.description}`);
        }

        if (issues.length > 50) {
            lines.push(`  ... and ${issues.length - 50} more`);
        }
    }

    if (!options.noUpsell) {
        lines.push('');
        lines.push(formatEnterpriseUpsell(liabilityMetrics(report, gateResult)));
    }

    return lines.join('\n');
}

module.exports = {
    formatTextReport,
    formatLiabilityReportCard,
    formatEnterpriseUpsell,
    paint,
    colorEnabled
};
