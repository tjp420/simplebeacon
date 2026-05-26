/**
 * Deterministic scan conclusion text for reports and dashboard UI.
 */

function issueList(report) {
    return report?.rawIssues || report?.detectedIssues || [];
}

function filterIssuesByKind(report, kind = 'all') {
    const raw = issueList(report);
    if (kind === 'fiction') {
        return raw.filter((i) => /fiction|fictional|consistency|kpi/i.test(String(i.type || '')));
    }
    if (kind === 'credentials') {
        return raw.filter((i) => /credential/i.test(String(i.type || '')));
    }
    if (kind === 'production') {
        return raw.filter((i) => /production leak/i.test(String(i.type || '')));
    }
    return raw;
}

function buildScanConclusion(report, options = {}) {
    if (!report) {
        return 'No scan report available.';
    }

    const focus = options.focus || 'all';
    const raw = focus === 'fiction' ? filterIssuesByKind(report, 'fiction') : issueList(report);
    const countIssues = (items) => items.reduce((sum, i) => sum + (i.count || 1), 0);

    const fiction = filterIssuesByKind(report, 'fiction');
    const credentials = filterIssuesByKind(report, 'credentials');
    const leaks = filterIssuesByKind(report, 'production');
    const schema = raw.filter((i) => /schema/i.test(String(i.type || '')));

    const parts = [];
    if (focus === 'fiction' || focus === 'all') {
        if (fiction.length) {
            parts.push(`${countIssues(fiction)} fiction/KPI pattern(s) in *-sample.json mock files`);
        } else if (focus === 'fiction') {
            parts.push('No known fictional KPI patterns in configured sample files');
        }
    }
    if (focus === 'all') {
        if (credentials.length) parts.push(`${countIssues(credentials)} credential pattern(s)`);
        if (leaks.length) parts.push(`${countIssues(leaks)} production-path sample reference(s)`);
        if (schema.length) parts.push(`${countIssues(schema)} schema violation(s)`);
    }

    const scope = 'Scoped to configured scanPaths and production directories — pattern matching only, not semantic code review.';
    const gateNote = report.gate?.pass
        ? 'Gate passes on configured severities.'
        : report.gate
            ? 'Gate would fail on configured severities — review before merge.'
            : '';

    if (!parts.length) {
        return focus === 'fiction'
            ? `No fiction KPI hits in mock samples. ${gateNote} ${scope}`.trim()
            : `Clean deterministic scan. ${gateNote} ${scope}`.trim();
    }

    return `${parts.join('; ')}. ${gateNote} ${scope}`.trim();
}

function resolveAutoAnalysisMode(projectPath, customIndicators = []) {
    const normalized = String(projectPath || '').replace(/\\/g, '/').toLowerCase();
    
    // Default indicators for simplebeacon-style projects
    const defaultIndicators = ['/data/mock', '/mock/data', 'fixtures', 'samples'];
    const activeIndicators = [...defaultIndicators, ...customIndicators];
    
    // Check if path contains any simplebeacon-style indicators
    if (activeIndicators.some(indicator => normalized.includes(indicator))) {
        return 'simplebeacon';
    }
    
    return 'roadmap';
}

module.exports = {
    buildScanConclusion,
    filterIssuesByKind,
    resolveAutoAnalysisMode
};
