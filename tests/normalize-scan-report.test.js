const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePlatformScanReport, isStaleFullTreeScan } = require('../src/lib/normalize-scan-report');

test('recomputes gate and quality from platform-only issues (stale full-tree metrics)', () => {
    const platformIssue = {
        id: 'cred-1',
        severity: 'high',
        type: 'Credential Pattern',
        count: 22,
        description: 'Test credential hits',
        filePath: 'server/routes/billing.js'
    };
    const benchmarkIssue = {
        id: 'bench-1',
        severity: 'high',
        type: 'Credential Pattern',
        count: 60,
        filePath: 'github-cache/some-repo/secret.json'
    };
    const report = {
        type: 'simplebeacon-report',
        projectRoot: '/tmp/example-ai-platform',
        scanPaths: ['/tmp/example-ai-platform'],
        mockSampleFiles: 35481,
        repositoryFilesTotal: 69421,
        qualityScore: 100,
        invalidJson: 26,
        credentialFindings: 82,
        gate: { pass: false, blockingCount: 30, warningCount: 0, failOn: ['high'], warnOn: ['medium', 'low'] },
        rawIssues: [platformIssue, benchmarkIssue],
        detectedIssues: [platformIssue],
        scanScope: { benchmarkCacheIssuesExcluded: 84 }
    };

    const normalized = normalizePlatformScanReport(report);

    assert.equal(isStaleFullTreeScan(report), true);
    assert.equal(normalized.scanScope.reportHealth, 'stale-full-tree-scan');
    assert.equal(normalized.scanScope.rescanRecommended, true);
    assert.equal(normalized.gate.blockingCount, 22);
    assert.equal(normalized.gate.pass, false);
    assert.equal(normalized.credentialFindings, 22);
    assert.ok(normalized.qualityScore < 100);
    assert.equal(normalized.rawIssues.length, 1);
    assert.equal(normalized.scanScope.benchmarkCacheIssuesExcluded, 1);
});

test('normalizes stale export (3) to zero actionable platform issues', () => {
    const reportPath = 'j:/Downloads/simplebeacon-report-2026-05-29(3).json';
    if (!require('fs').existsSync(reportPath)) {
        return;
    }
    const report = require(reportPath);
    const normalized = normalizePlatformScanReport(report);
    assert.equal(normalized.rawIssues.length, 0);
    assert.equal(normalized.gate.pass, true);
    assert.equal(normalized.scanScope.reportHealth, 'stale-full-tree-scan');
    assert.equal(normalized.scanScope.excludedScanNoiseIssues, 23);
    assert.equal(normalized.mockDataCategories.length, 1);
    assert.match(normalized.mockDataCategories[0].category, /Stale inventory/);
});

test('passes gate when no blocking platform issues remain', () => {
    const report = {
        type: 'simplebeacon-report',
        projectRoot: '/repo/ai-platform',
        scanPaths: ['/repo/ai-platform/web/data'],
        mockSampleFiles: 48,
        rawIssues: [{
            id: 'dup-1',
            severity: 'low',
            type: 'Duplicate Data',
            count: 1,
            description: 'duplicate export',
            filePath: 'web/data/a-sample.json'
        }],
        gate: { pass: false, blockingCount: 5 }
    };
    const normalized = normalizePlatformScanReport(report);
    assert.equal(normalized.gate.pass, true);
    assert.equal(normalized.gate.blockingCount, 0);
    assert.equal(normalized.issueCount, 1);
});

test('critical credential issues always block gate', () => {
    const report = {
        type: 'simplebeacon-report',
        projectRoot: '/repo/ai-platform',
        scanPaths: ['/repo/ai-platform/web/data'],
        mockSampleFiles: 48,
        gate: { failOn: ['high'], warnOn: ['medium', 'low'] },
        rawIssues: [{
            id: 'crit-1',
            severity: 'high',
            severityBand: 'critical',
            type: 'Credential Pattern',
            count: 1,
            filePath: 'server/routes/billing.js'
        }]
    };
    const normalized = normalizePlatformScanReport(report);
    assert.equal(normalized.gate.pass, false);
    assert.equal(normalized.gate.blockingCount, 1);
});
