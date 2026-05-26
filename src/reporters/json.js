/**
 * JSON reporter for simplebeacon scan results.
 */

const { sanitizeScanReport } = require('../lib/report-sanitizer');

function formatJsonReport(report, gateResult = null) {
    const payload = {
        ...report,
        gate: gateResult
            ? {
                pass: gateResult.pass,
                failOn: gateResult.failOn,
                warnOn: gateResult.warnOn,
                blockingCount: gateResult.blockingIssues.length,
                warningCount: gateResult.warningIssues.length
            }
            : null
    };
    return sanitizeScanReport(payload);
}

module.exports = {
    formatJsonReport
};
