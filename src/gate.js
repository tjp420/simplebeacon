/**
 * Evaluate simplebeacon gate against configured severities.
 */

const { isBlockingIssue } = require('./scan');

function evaluateGate(report, gateConfig = {}) {
    const failOn = new Set(gateConfig.failOn || ['high']);
    const warnOn = new Set(gateConfig.warnOn || ['medium', 'low']);
    const rawIssues = report.rawIssues || [];
    const issueSeverity = (issue) => issue.severityBand || issue.severity;

    const blockingIssues = rawIssues.filter(
        (issue) => failOn.has(issueSeverity(issue)) && isBlockingIssue(issue)
    );
    const warningIssues = rawIssues.filter(
        (issue) => warnOn.has(issueSeverity(issue)) && isBlockingIssue(issue)
    );

    return {
        pass: blockingIssues.length === 0,
        blockingIssues,
        warningIssues,
        failOn: [...failOn],
        warnOn: [...warnOn]
    };
}

module.exports = {
    evaluateGate
};
