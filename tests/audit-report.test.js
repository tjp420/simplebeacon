const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    compileAuditReportMarkdown,
    collectIssues,
    buildDetailedFindings,
    buildComplianceTable
} = require('../src/reporters/audit-report');
const { buildAssessmentReport } = require('../src/assessment');

const sampleReport = {
    generatedAt: '2026-05-26T12:00:00.000Z',
    projectRoot: '/tmp/acme',
    totalFiles: 342,
    severityCounts: { critical: 1, high: 2, medium: 4, low: 1 },
    credentialFindings: 1,
    productionLeakFindings: 2,
    schemaChecked: 3,
    schemaPassed: 3,
    consistencyChecked: 2,
    consistencyPassed: false,
    consistencyScore: 72,
    gate: { pass: false, blockingCount: 3 },
    rawIssues: [
        {
            type: 'Credential Pattern',
            severity: 'critical',
            filePath: 'server/config/storage.js',
            line: 42,
            pattern: 'aws-access-key',
            description: 'possible aws-access-key',
            recommendedAction: 'Remove and rotate credential',
            metadata: { snippet: 'const AWS_SECRET = "AKIAIOSFODNN7EXAMPLE";' }
        },
        {
            type: 'Production Leak',
            severity: 'high',
            filePath: 'client/src/components/AnalyticsDashboard.tsx',
            line: 89,
            description: "import kpiData from '../../web/data/dashboard-sample.json'",
            recommendedAction: 'Replace import with production API call'
        },
        {
            type: 'Production Leak',
            severity: 'high',
            filePath: 'server/routes/analytics.js',
            line: 17,
            description: "path.join(__dirname, '../web/data/status-sample.json')",
            recommendedAction: 'Route through database or API layer'
        },
        {
            type: 'Fictional KPI',
            severity: 'medium',
            filePath: 'client/public/locales/en/common.json',
            line: 114,
            description: 'completion_rate: "98.5%", confidence_score: "94.3%"',
            recommendedAction: 'Bind labels to live reporting data'
        },
        {
            type: 'Schema Violation',
            severity: 'medium',
            filePath: 'web/data/extra-sample.json',
            description: 'missing required page-spec keys',
            recommendedAction: 'Align with page spec'
        },
        {
            type: 'Roadmap Template',
            severity: 'low',
            filePath: 'docs/roadmap-template.md',
            description: 'informational roadmap template pattern',
            recommendedAction: 'No action required'
        }
    ]
};

test('collectIssues normalizes rawIssues from scan report', () => {
    const issues = collectIssues(sampleReport);
    assert.equal(issues.length, 6);
    assert.equal(issues[0].filePath, 'server/config/storage.js');
    assert.equal(issues[0].severity, 'critical');
});

test('buildDetailedFindings renders critical/high sections and summary', () => {
    const issues = collectIssues(sampleReport);
    const markdown = buildDetailedFindings(issues);

    assert.match(markdown, /### Critical — Hardcoded AWS access key pattern/);
    assert.match(markdown, /### High — Production code references mock sample JSON/);
    assert.match(markdown, /Additional schema and consistency notes/);
    assert.match(markdown, /Full machine-readable output/);
});

test('buildComplianceTable uses evaluated checklist rules', () => {
    const assessment = buildAssessmentReport(sampleReport, {
        company: 'Digital Build Agency LLC',
        assessor: 'Trevor'
    });
    const table = buildComplianceTable(sampleReport, assessment, sampleReport.projectRoot);

    assert.match(table, /Zero hardcoded credential patterns \| \*\*FAIL\*\*/);
    assert.match(table, /Production path separation \| \*\*FAIL\*\*/);
    assert.match(table, /Schema conformity \(configured samples\) \| \*\*PASS\*\*/);
});

test('compileAuditReportMarkdown matches SAMPLE_REPORT structure', () => {
    const assessment = buildAssessmentReport(sampleReport, {
        company: 'Digital Build Agency LLC',
        assessor: 'Simplebeacon Security Audit Service'
    });

    const markdown = compileAuditReportMarkdown(sampleReport, {
        client: 'Acme Enterprise Dashboard',
        company: 'Digital Build Agency LLC',
        assessor: 'Simplebeacon Security Audit Service',
        branch: 'staging',
        assessment,
        projectRoot: sampleReport.projectRoot
    });

    assert.match(markdown, /^# Simplebeacon Pre-Launch Code Audit Report/m);
    assert.match(markdown, /\*\*Target project:\*\* Acme Enterprise Dashboard \(staging branch\)/);
    assert.match(markdown, /## Executive summary/);
    assert.match(markdown, /### Vulnerability count by severity/);
    assert.match(markdown, /\| Critical \| 1 \|/);
    assert.match(markdown, /## Detailed findings/);
    assert.match(markdown, /## How to fix each issue/);
    assert.match(markdown, /### Fix: Hardcoded credential patterns/);
    assert.match(markdown, /## Your personalized action plan/);
    assert.match(markdown, /### Week 1: Critical path/);
    assert.match(markdown, /## Compliance and gate recommendations/);
    assert.match(markdown, /Recommended local hook/);
    assert.match(markdown, /## Commands run \(this audit\)/);
    assert.match(markdown, /## Disclaimer/);
    assert.match(markdown, /\*\*Gate result\*\* \| \*\*FAIL\*\*/);
    assert.doesNotMatch(markdown, /🔴|🟠|🟡|🟢/);
});
