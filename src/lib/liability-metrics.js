/**
 * Aggregate unaudited AI / liability signals for terminal report cards.
 */

const AI_ISSUE_PATTERN = /slop|fiction|mock|sample|placeholder|fixtures-path|production leak|SB-FICTION|undocumented|TODO implement|your api key/i;

function countAiRelatedIssues(issues) {
    return (issues || []).filter((issue) => {
        const haystack = `${issue.type || ''} ${issue.description || ''} ${issue.filePath || ''}`;
        return AI_ISSUE_PATTERN.test(haystack);
    }).length;
}

function liabilityMetrics(report, gateResult = null) {
    const issues = report.rawIssues || [];
    const slopHits = Number(report.llmSlopPatternHits) || 0;
    const slopFiles = Number(report.llmSlopFilesScanned) || 0;
    const mockSampleFiles = Number(report.mockSampleFiles) || 0;
    const productionLeaks = Number(report.productionLeakFindings) || 0;
    const fictionKpis = issues.filter((issue) => /fiction|kpi|SB-FICTION/i.test(`${issue.type} ${issue.description}`)).length;
    const placeholderHits = issues.filter((issue) => /slop|placeholder|TODO implement|your api key/i.test(`${issue.type} ${issue.description}`)).length;
    const mockPathHits = issues.filter((issue) => /mock|sample|fixture/i.test(`${issue.type} ${issue.description} ${issue.filePath || ''}`)).length;
    const aiIssueCount = countAiRelatedIssues(issues);
    const unauditedArtifacts = Math.max(aiIssueCount, slopHits + fictionKpis + mockPathHits);
    const blockingCount = gateResult?.blockingIssues?.length
        ?? report.gate?.blockingCount
        ?? issues.filter((issue) => issue.severity === 'high' || issue.severity === 'critical').length;

    return {
        slopHits,
        slopFiles,
        mockSampleFiles,
        productionLeaks,
        fictionKpis,
        placeholderHits,
        mockPathHits,
        unauditedArtifacts,
        blockingCount,
        qualityScore: report.qualityScore ?? null
    };
}

module.exports = {
    liabilityMetrics,
    countAiRelatedIssues
};
