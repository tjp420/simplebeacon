const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildScanConclusion,
    filterIssuesByKind,
    resolveAutoAnalysisMode
} = require('../src/lib/scan-conclusion');

test('buildScanConclusion summarizes fiction scope honestly', () => {
    const report = {
        gate: { pass: false },
        rawIssues: [
            { type: 'Fictional KPI', count: 2, severity: 'high' },
            { type: 'Credential Pattern', count: 1, severity: 'high' }
        ]
    };
    const fictionOnly = buildScanConclusion(report, { focus: 'fiction' });
    assert.match(fictionOnly, /2 fiction\/KPI pattern\(s\)/);
    assert.match(fictionOnly, /\*-sample\.json/);
    assert.doesNotMatch(fictionOnly, /credential/i);
});

test('filterIssuesByKind isolates fiction hits', () => {
    const report = {
        rawIssues: [
            { type: 'Fictional KPI', count: 1 },
            { type: 'Credential Pattern', count: 1 }
        ]
    };
    assert.equal(filterIssuesByKind(report, 'fiction').length, 1);
});

test('resolveAutoAnalysisMode prefers simplebeacon for mock data indicators', () => {
    assert.equal(resolveAutoAnalysisMode('/tmp/project/data/mock'), 'simplebeacon');
    assert.equal(resolveAutoAnalysisMode('/tmp/project/mock/data'), 'simplebeacon');
    assert.equal(resolveAutoAnalysisMode('/tmp/project/fixtures'), 'simplebeacon');
    assert.equal(resolveAutoAnalysisMode('/tmp/project/samples'), 'simplebeacon');
    assert.equal(resolveAutoAnalysisMode('/tmp/random-app/src'), 'roadmap');
});

test('resolveAutoAnalysisMode respects custom indicators', () => {
    assert.equal(resolveAutoAnalysisMode('/tmp/project/web/data', ['web/data']), 'simplebeacon');
    assert.equal(resolveAutoAnalysisMode('/tmp/project/custom-dir', ['custom-dir']), 'simplebeacon');
    assert.equal(resolveAutoAnalysisMode('/tmp/project/other', ['custom-dir']), 'roadmap');
});
