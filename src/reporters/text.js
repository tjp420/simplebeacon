/**
 * Text reporter for simplebeacon scan results.
 */

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

function formatTextReport(report, gateResult = null) {
    const lines = [];
    lines.push(paint('Simplebeacon', 'cyan'));
    lines.push('==================');
    lines.push(`Root: ${report.projectRoot}`);
    if (report.repositoryFilesTotal != null) {
        lines.push(`Repository files: ${report.repositoryFilesTotal.toLocaleString()}`);
    }
    lines.push(`Gate rules checked: ${report.ruleScopedFilesAnalyzed ?? report.filesAnalyzed ?? report.totalFiles} files`);
    if (report.mockSampleFiles != null) {
        lines.push(`Mock/sample files: ${report.mockSampleFiles}`);
    }
    lines.push(`Quality score: ${report.qualityScore}/100`);
    lines.push('');

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

    if (gateResult) {
        lines.push(gateResult.pass ? paint('Gate: PASS', 'green') : paint('Gate: FAIL', 'red'));
        lines.push('');
    }

    const issues = report.rawIssues || [];
    if (issues.length === 0) {
        lines.push(paint('No issues detected.', 'green'));
        return lines.join('\n');
    }

    lines.push('Issues:');
    for (const issue of issues.slice(0, 50)) {
        const label = `[${issue.severity}] ${issue.type}`;
        lines.push(`  ${paint(label, severityColor(issue.severity))}: ${issue.description}`);
    }

    if (issues.length > 50) {
        lines.push(`  ... and ${issues.length - 50} more`);
    }

    return lines.join('\n');
}

module.exports = {
    formatTextReport,
    paint,
    colorEnabled
};
