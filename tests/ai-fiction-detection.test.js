const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFictionPatternCatalog, countFictionIssues } = require('../src/rules/ai-fiction-detection');
const { buildDashboardPayload, findHistoryEntry, buildAuditPayload } = require('../src/lib/dashboard-payload');

const BASELINE = {
  rejectedFiction: {
    featureCounts: [47, 8],
    completionRates: [62, 74.17],
    mockFileCounts: [1247],
    openIssueCounts: [156],
    modelNames: ['unbreakable-oracle'],
    aiConfidenceScores: [98.5],
    throughputClaims: ['1559']
  }
};

test('buildFictionPatternCatalog seeds from baseline.rejectedFiction', () => {
  const catalog = buildFictionPatternCatalog(BASELINE);
  assert.ok(catalog.length >= 8);
  assert.ok(catalog.some((entry) => entry.pattern.includes('62')));
  assert.ok(catalog.every((entry) => entry.isRejected === true));
});

test('countFictionIssues counts fictional KPI issues in report', () => {
  const report = {
    rawIssues: [
      { type: 'Fictional KPI', count: 2 },
      { type: 'Schema Violation', count: 1 }
    ]
  };
  assert.equal(countFictionIssues(report), 2);
});

test('buildDashboardPayload aggregates report, history, and catalog', () => {
  const report = {
    generatedAt: '2026-05-24T04:43:11.700Z',
    qualityScore: 99,
    consistencyScore: 100,
    totalFiles: 42,
    issueCount: 0,
    gate: { pass: true },
    rawIssues: []
  };
  const baseline = { pageSamplesLabel: '42/42', jestTestsLabel: '596/596' };
  const history = [
    {
      scanId: 'scan-1',
      date: report.generatedAt,
      qualityScore: 99,
      fictionPatternsFound: 0,
      totalFilesScanned: 42
    }
  ];
  const payload = buildDashboardPayload({
    report,
    baseline,
    history,
    fictionCatalog: buildFictionPatternCatalog(BASELINE)
  });

  assert.equal(payload.scanStatus.qualityScore, 99);
  assert.ok(payload.scanStatus.knownFictionPatterns > 0);
  assert.equal(payload.baselineStatus.status, 'pass');
  assert.deepEqual(payload.trends.qualityScoreTrend, [99]);
});

test('findHistoryEntry resolves latest and scanId lookups', () => {
  const history = [
    { scanId: 'a', date: '2026-05-01T00:00:00.000Z' },
    { scanId: 'b', date: '2026-05-02T00:00:00.000Z' }
  ];
  assert.equal(findHistoryEntry(history, 'latest').scanId, 'b');
  assert.equal(findHistoryEntry(history, 'a').scanId, 'a');
  assert.equal(findHistoryEntry(history, 'missing'), null);
});

test('buildAuditPayload includes all audit layers', () => {
  const report = {
    generatedAt: '2026-05-24T00:00:00.000Z',
    qualityScore: 99,
    consistencyScore: 100,
    schemaCompliance: 100,
    totalFiles: 42,
    issueCount: 0,
    gate: { pass: true, failOn: ['high'], blockingCount: 0 },
    rawIssues: [],
    credentialScanned: 10,
    credentialFindings: 0,
    productionLeakScanned: 5,
    productionLeakFindings: 0,
    schemaChecked: 42,
    schemaPassed: 42
  };
  const baseline = { pageSamplesLabel: '42/42', jestTestsLabel: '596/596' };
  const payload = buildAuditPayload({ report, baseline, history: [], fictionCatalog: [] }, {});
  assert.equal(payload.auditLayers.credentials.status, 'pass');
  assert.equal(payload.auditLayers.fictionKpis.status, 'pass');
  assert.equal(payload.auditLayers.gate.pass, true);
});
