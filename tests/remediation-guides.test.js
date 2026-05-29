const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    issueKind,
    collectActiveGuideIds,
    buildHowToFixSection,
    buildPersonalizedActionPlan
} = require('../src/reporters/remediation-guides');
const { buildAssessmentReport } = require('../src/assessment');
const { collectIssues } = require('../src/reporters/audit-report');

const sampleReport = {
    severityCounts: { critical: 1, high: 1, medium: 0, low: 0 },
    gate: { pass: false },
    rawIssues: [
        {
            type: 'Credential Pattern',
            severity: 'critical',
            filePath: 'server/config/storage.js',
            description: 'possible aws-access-key'
        },
        {
            type: 'Production Leak',
            severity: 'high',
            filePath: 'client/src/App.tsx',
            description: 'dashboard-sample.json import'
        }
    ]
};

test('issueKind maps scan types to playbook categories', () => {
    assert.equal(issueKind({ type: 'Credential Pattern' }), 'credentials');
    assert.equal(issueKind({ type: 'Production Leak' }), 'production-leak');
    assert.equal(issueKind({ type: 'Fictional KPI' }), 'fiction-kpi');
    assert.equal(issueKind({ type: 'Schema Violation' }), 'schema');
});

test('collectActiveGuideIds includes credentials, production-leak, and CI for failed gate', () => {
    const assessment = buildAssessmentReport(sampleReport, { company: 'Acme' });
    const issues = collectIssues(sampleReport);
    const ids = collectActiveGuideIds(issues, assessment);

    assert.ok(ids.includes('credentials'));
    assert.ok(ids.includes('production-leak'));
    assert.ok(ids.includes('ci-integration'));
});

test('buildHowToFixSection renders step-by-step guides with verify commands', () => {
    const assessment = buildAssessmentReport(sampleReport, { company: 'Acme' });
    const markdown = buildHowToFixSection(collectIssues(sampleReport), assessment);

    assert.match(markdown, /### Fix: Hardcoded credential patterns/);
    assert.match(markdown, /### Fix: Production code references mock or sample JSON/);
    assert.match(markdown, /\*\*Step-by-step:\*\*/);
    assert.match(markdown, /\*\*Verify:\*\* `npx simplebeacon scan --gate`/);
    assert.match(markdown, /### Fix: Simplebeacon CI gate on pull requests/);
});

test('buildPersonalizedActionPlan prioritizes week 1 critical fixes', () => {
    const assessment = buildAssessmentReport(sampleReport, { company: 'Acme' });
    const plan = buildPersonalizedActionPlan(collectIssues(sampleReport), assessment);

    assert.match(plan, /### Week 1: Critical path/);
    assert.match(plan, /Remove and rotate exposed credentials/);
    assert.match(plan, /Replace production-path sample JSON references/);
    assert.match(plan, /### Week 2: Prevention setup/);
    assert.match(plan, /Integrate Simplebeacon gate into CI\/CD/);
    assert.match(plan, /Estimated total effort/);
});

test('buildHowToFixSection returns clean-scan message when no findings', () => {
    const clean = { gate: { pass: true }, rawIssues: [] };
    const assessment = buildAssessmentReport(clean, { company: 'Acme' });
    const markdown = buildHowToFixSection([], assessment);

    assert.match(markdown, /No blocking findings/);
});
