/**
 * Fiction pattern catalog derived from repository-audit baseline.
 * Used by dashboard API and sample-consistency checks — sample JSON scope only.
 */

const SEVERITY_BY_TYPE = {
    completion_rate: 'high',
    feature_count: 'high',
    ai_confidence: 'high',
    open_issues: 'high',
    mock_file_count: 'medium',
    model_name: 'medium',
    throughput_claim: 'low'
};

function buildFictionPatternCatalog(baseline = {}) {
    const rejected = baseline.rejectedFiction || {};
    const patterns = [];

    for (const rate of rejected.completionRates || []) {
        patterns.push({
            pattern: `completionRate: ${rate}`,
            patternType: 'completion_rate',
            severity: SEVERITY_BY_TYPE.completion_rate,
            description: `Known fictional completion rate (${rate}%)`,
            isRejected: true
        });
    }

    for (const count of rejected.featureCounts || []) {
        patterns.push({
            pattern: `totalFeatures: ${count}`,
            patternType: 'feature_count',
            severity: SEVERITY_BY_TYPE.feature_count,
            description: `Known fictional feature count (${count})`,
            isRejected: true
        });
    }

    for (const score of rejected.aiConfidenceScores || []) {
        patterns.push({
            pattern: `aiConfidence: ${score}`,
            patternType: 'ai_confidence',
            severity: SEVERITY_BY_TYPE.ai_confidence,
            description: `Known fictional AI confidence score (${score}%)`,
            isRejected: true
        });
    }

    for (const count of rejected.openIssueCounts || []) {
        patterns.push({
            pattern: `openIssues: ${count}`,
            patternType: 'open_issues',
            severity: SEVERITY_BY_TYPE.open_issues,
            description: `Known fictional open-issue count (${count})`,
            isRejected: true
        });
    }

    for (const count of rejected.mockFileCounts || []) {
        patterns.push({
            pattern: `mockFiles: ${count}`,
            patternType: 'mock_file_count',
            severity: SEVERITY_BY_TYPE.mock_file_count,
            description: `Known fictional mock file count (${count})`,
            isRejected: true
        });
    }

    for (const name of rejected.modelNames || []) {
        patterns.push({
            pattern: `model: ${name}`,
            patternType: 'model_name',
            severity: SEVERITY_BY_TYPE.model_name,
            description: `Known fictional model name (${name})`,
            isRejected: true
        });
    }

    for (const claim of rejected.throughputClaims || []) {
        patterns.push({
            pattern: `throughput: ${claim}`,
            patternType: 'throughput_claim',
            severity: SEVERITY_BY_TYPE.throughput_claim,
            description: `Known fictional throughput claim (${claim} files/s)`,
            isRejected: true
        });
    }

    return patterns;
}

function countFictionIssues(report = {}) {
    const raw = report.rawIssues || report.detectedIssues || [];
    return raw
        .filter((issue) => /fiction|Fictional KPI|consistency/i.test(String(issue.type)))
        .reduce((sum, issue) => sum + (issue.count || 1), 0);
}

function mapFictionIssuesForResults(report = {}) {
    const raw = report.rawIssues || report.detectedIssues || [];
    return raw
        .filter((issue) => /fiction|Fictional KPI|consistency/i.test(String(issue.type)))
        .map((issue) => ({
            type: 'fictional_pattern',
            severity: issue.severity || 'high',
            pattern: issue.description || issue.type,
            file: issue.filePath || issue.file,
            count: issue.count || 1
        }));
}

module.exports = {
    buildFictionPatternCatalog,
    countFictionIssues,
    mapFictionIssuesForResults,
    SEVERITY_BY_TYPE
};
