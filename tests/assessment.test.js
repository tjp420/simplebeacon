const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAssessmentReport, bucketIssues } = require('../src/assessment');

test('bucketIssues categorizes scan findings', () => {
    const buckets = bucketIssues([
        { type: 'Credential Pattern', severity: 'high', description: 'key found' },
        { type: 'Fictional KPI', severity: 'high', description: '47 features' },
        { type: 'Production Leak', severity: 'medium', description: 'sample path' },
        { type: 'Schema Violation', severity: 'high', description: 'missing key' }
    ]);
    assert.equal(buckets.credentials.length, 1);
    assert.equal(buckets.fictionKpis.length, 1);
    assert.equal(buckets.productionLeaks.length, 1);
    assert.equal(buckets.schemaDrift.length, 1);
});

test('buildAssessmentReport produces customer deliverable shape', () => {
    const report = buildAssessmentReport({
        projectRoot: '/tmp/repo',
        totalFiles: 42,
        qualityScore: 99,
        severityCounts: { critical: 1, high: 1, medium: 0, low: 0 },
        rawIssues: [
            {
                type: 'Fictional KPI',
                severity: 'high',
                description: 'totalFeatures=47',
                filePath: 'web/data/foo-sample.json',
                recommendedAction: 'Replace with baseline'
            }
        ],
        gate: { pass: false, blockingCount: 1 }
    }, { company: 'Acme Corp', assessor: 'Trevor' });

    assert.equal(report.type, 'simplebeacon-assessment-report');
    assert.equal(report.title, 'Simplebeacon Free Assessment — Acme Corp');
    assert.equal(report.executiveSummary.gateResult, 'FAIL');
    assert.equal(report.executiveSummary.criticalIssues, 1);
    assert.equal(report.findings.fictionKpis.items.length, 1);
    assert.ok(report.executiveSummary.headline.includes('fiction'));
    assert.ok(report.recommendedActions.immediate.length >= 1);
    assert.ok(report.complianceChecklist);
    assert.equal(typeof report.executiveSummary.complianceScore, 'number');
});
