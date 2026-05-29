/**
 * Shared issue grouping and severity helpers (avoids scan ↔ gate circular imports).
 */

const INFORMATIONAL_ISSUE_TYPES = new Set([
    'Legacy Fiction Roadmap',
    'Oversized Roadmap File'
]);

function isBlockingIssue(issue) {
    return !INFORMATIONAL_ISSUE_TYPES.has(issue.type);
}

function groupIssues(issues) {
    const grouped = new Map();

    for (const issue of issues) {
        const key = issue.id
            ? `${issue.severity}|${issue.type}|${issue.id}`
            : `${issue.severity}|${issue.type}|${issue.description}`;
        const existing = grouped.get(key);
        if (existing) {
            existing.count += 1;
            const nextSeverity = issue.severityBand || issue.severity;
            if (nextSeverity === 'critical' || (nextSeverity === 'high' && existing.severity !== 'critical')) {
                existing.severity = nextSeverity;
                existing.severityBand = nextSeverity;
            }
            for (const fileName of issue.affectedFiles || []) {
                if (!existing.affectedFiles.includes(fileName)) {
                    existing.affectedFiles.push(fileName);
                }
            }
            for (const filePath of issue.filePaths || issue.metadata?.duplicatePaths || []) {
                if (!existing.filePaths.includes(filePath)) {
                    existing.filePaths.push(filePath);
                }
            }
        } else {
            grouped.set(key, {
                severity: issue.severityBand || issue.severity,
                severityBand: issue.severityBand || issue.severity,
                type: issue.type,
                count: 1,
                description: issue.description,
                pattern: issue.pattern || issue.metadata?.patternId || null,
                line: issue.line || issue.metadata?.line || null,
                recommendation: issue.recommendation || issue.recommendedAction || null,
                recommendedAction: issue.recommendedAction || issue.recommendation,
                affectedFiles: [...(issue.affectedFiles || [])],
                filePaths: [
                    ...(issue.filePaths || issue.metadata?.duplicatePaths || (issue.filePath ? [issue.filePath] : []))
                ]
            });
        }
    }

    return [...grouped.values()].map((item) => ({
        ...item,
        file: item.filePaths?.[0] || item.affectedFiles?.[0] || null,
        affectedFiles: item.affectedFiles.slice(0, 8)
    }));
}

function countBySeverity(issues) {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const issue of issues) {
        const severityBand = issue.severityBand || issue.severity;
        if (counts[severityBand] != null) {
            counts[severityBand] += issue.count || 1;
        } else if (counts[issue.severity] != null) {
            counts[issue.severity] += issue.count || 1;
        }
    }
    return counts;
}

module.exports = {
    INFORMATIONAL_ISSUE_TYPES,
    isBlockingIssue,
    groupIssues,
    countBySeverity
};
