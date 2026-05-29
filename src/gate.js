/**
 * Evaluate simplebeacon gate against configured severities.
 */

const { isBlockingIssue } = require('./lib/issue-utils');

function evaluateGate(report, gateConfig = {}) {
    const failOn = new Set(gateConfig.failOn || ['high']);
    const warnOn = new Set(gateConfig.warnOn || ['medium', 'low']);
    const rawIssues = report.rawIssues || [];
    const issueSeverity = (issue) => issue.severityBand || issue.severity;

    const blockingIssues = rawIssues.filter(
        (issue) => isBlockingIssue(issue)
            && (issueSeverity(issue) === 'critical' || failOn.has(issueSeverity(issue)))
    );
    const warningIssues = rawIssues.filter(
        (issue) => isBlockingIssue(issue)
            && issueSeverity(issue) !== 'critical'
            && warnOn.has(issueSeverity(issue))
            && !failOn.has(issueSeverity(issue))
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
