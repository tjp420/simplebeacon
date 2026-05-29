/**
 * Cross-reference data-cleanup findings across scanners.
 */

function crossReferenceScannerResults(results = {}) {
    const privacyFindings = results['data-privacy']?.findings || [];
    const lineageFindings = results['data-lineage']?.findings || [];

    if (!privacyFindings.length || !lineageFindings.length) {
        return results;
    }

    const orphanedPaths = new Set(
        lineageFindings
            .filter((finding) => finding.type === 'orphaned-data')
            .map((finding) => finding.path)
    );

    if (!orphanedPaths.size) {
        return results;
    }

    for (const finding of privacyFindings) {
        if (!orphanedPaths.has(finding.path)) continue;
        if (finding.severity === 'medium') {
            finding.severity = 'high';
        } else if (finding.severity === 'low') {
            finding.severity = 'medium';
        }
        finding.metadata = {
            ...(finding.metadata || {}),
            crossAnalyzerBoost: 'orphaned-data-with-pii'
        };
    }

    return results;
}

module.exports = {
    crossReferenceScannerResults
};
