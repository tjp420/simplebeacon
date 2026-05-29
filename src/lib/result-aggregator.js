/**
 * Aggregate and prioritize findings across cleanup scanners.
 */

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function aggregateCleanupFindings(allFindings = []) {
    const bySeverity = { critical: [], high: [], medium: [], low: [] };
    const byCategory = new Map();
    const byFile = new Map();
    const seen = new Set();
    const deduped = [];

    for (const finding of allFindings) {
        const key = `${finding.type}:${finding.path}:${finding.reason}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(finding);

        const severity = finding.severity || 'low';
        if (bySeverity[severity]) bySeverity[severity].push(finding);

        const category = finding.type || 'other';
        byCategory.set(category, (byCategory.get(category) || 0) + 1);

        const fileKey = finding.path || 'unknown';
        const bucket = byFile.get(fileKey) || [];
        bucket.push(finding);
        byFile.set(fileKey, bucket);
    }

    const prioritized = [...deduped].sort((a, b) => {
        const left = SEVERITY_ORDER[a.severity] ?? 9;
        const right = SEVERITY_ORDER[b.severity] ?? 9;
        if (left !== right) return left - right;
        return String(a.path).localeCompare(String(b.path));
    });

    return {
        findings: prioritized,
        bySeverity,
        byCategory: Object.fromEntries(byCategory.entries()),
        topFiles: [...byFile.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 20)
            .map(([filePath, findings]) => ({ filePath, count: findings.length }))
    };
}

module.exports = {
    aggregateCleanupFindings
};
