const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    compileAuditReportMarkdown,
    replaceExecutiveSummaryBody
} = require('../src/reporters/audit-report');
const {
    buildEnhanceContext,
    parseEnhanceResponse,
    assembleEnhancedExecutiveSummary,
    enhanceExecutiveSummary
} = require('../src/reporters/report-enhance');
const { buildAssessmentReport } = require('../src/assessment');

const sampleReport = {
    generatedAt: '2026-05-26T12:00:00.000Z',
    projectRoot: '/tmp/acme',
    totalFiles: 342,
    severityCounts: { critical: 1, high: 2, medium: 4, low: 1 },
    gate: { pass: false, blockingCount: 3 },
    rawIssues: [
        {
            type: 'Credential Pattern',
            severity: 'critical',
            filePath: 'server/config/storage.js',
            line: 42,
            description: 'possible aws-access-key',
            recommendedAction: 'Remove and rotate credential'
        },
        {
            type: 'Production Leak',
            severity: 'high',
            filePath: 'client/src/components/AnalyticsDashboard.tsx',
            line: 89,
            description: "import kpiData from '../../web/data/dashboard-sample.json'",
            recommendedAction: 'Replace import with production API call'
        }
    ]
};

test('buildEnhanceContext uses rawIssues and assessment executive summary only', () => {
    const assessment = buildAssessmentReport(sampleReport, {
        company: 'Digital Build Agency LLC',
        assessor: 'Jane'
    });
    const context = buildEnhanceContext(sampleReport, assessment, {
        client: 'Acme Dashboard',
        company: 'Digital Build Agency LLC'
    });

    assert.equal(context.rawIssues.length, 2);
    assert.equal(context.rawIssues[0].filePath, 'server/config/storage.js');
    assert.equal(context.gateResult, 'FAIL');
    assert.equal(context.deterministicHeadline, assessment.executiveSummary.headline);
    assert.equal(context.severityCounts.critical, 1);
    assert.ok(Array.isArray(context.failedRules));
});

test('parseEnhanceResponse extracts intro, businessImpact, and headline', () => {
    const parsed = parseEnhanceResponse(JSON.stringify({
        intro: 'The repository has blocking security issues before client handoff.',
        businessImpact: 'Credential exposure could force an emergency rotation.',
        headline: 'Rotate AWS keys and remove mock JSON imports before launch.'
    }));

    assert.match(parsed.intro, /blocking security issues/);
    assert.match(parsed.businessImpact, /Credential exposure/);
    assert.match(parsed.headline, /Rotate AWS keys/);
});

test('assembleEnhancedExecutiveSummary keeps deterministic metrics tables', () => {
    const body = assembleEnhancedExecutiveSummary({
        intro: 'AI intro paragraph.',
        businessImpact: 'Business impact paragraph.',
        headline: 'Fix credentials first.'
    }, sampleReport, {});

    assert.match(body, /AI intro paragraph/);
    assert.match(body, /\| Critical \| 1 \|/);
    assert.match(body, /\| High \| 2 \|/);
    assert.match(body, /Business impact paragraph/);
    assert.match(body, /\*\*Headline:\*\* Fix credentials first\./);
});

test('enhanceExecutiveSummary replaces executive summary but preserves detailed findings', async () => {
    const assessment = buildAssessmentReport(sampleReport, {
        company: 'Digital Build Agency LLC',
        assessor: 'Jane'
    });
    const baseMarkdown = compileAuditReportMarkdown(sampleReport, {
        client: 'Acme Dashboard',
        company: 'Digital Build Agency LLC',
        assessment
    });
    const detailedSection = baseMarkdown.split('## Detailed findings')[1];

    const enhanced = await enhanceExecutiveSummary(baseMarkdown, sampleReport, assessment, {
        client: 'Acme Dashboard',
        company: 'Digital Build Agency LLC',
        callAI: async () => JSON.stringify({
            intro: 'Before go-live, this codebase exposes credentials and ships mock analytics data in production paths.',
            businessImpact: 'Agency reputation and client trust are at risk if these issues reach production.',
            headline: 'Remove hardcoded AWS credentials and mock JSON imports before client handoff.'
        })
    });

    assert.match(enhanced, /Before go-live, this codebase exposes credentials/);
    assert.match(enhanced, /\| Critical \| 1 \|/);
    assert.doesNotMatch(enhanced, /Simplebeacon performed a read-only static analysis/);
    assert.equal(enhanced.split('## Detailed findings')[1], detailedSection);
});

test('replaceExecutiveSummaryBody swaps narrative while keeping section boundaries', () => {
    const assessment = buildAssessmentReport(sampleReport, {
        company: 'Digital Build Agency LLC'
    });
    const markdown = compileAuditReportMarkdown(sampleReport, {
        client: 'Acme Dashboard',
        company: 'Digital Build Agency LLC',
        assessment
    });
    const updated = replaceExecutiveSummaryBody(markdown, 'Replacement executive summary body.');

    assert.match(updated, /## Executive summary\n\nReplacement executive summary body\.\n\n---\n\n## Detailed findings/);
    assert.match(updated, /### Critical — Hardcoded credential pattern/);
});
