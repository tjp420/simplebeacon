const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    normalizeFileReductionReport,
    isStaleFileReductionScan
} = require('../src/lib/normalize-file-reduction-report');
const { globMatch } = require('../src/rules/production-leak');

test('isStaleFileReductionScan detects github-cache pollution', () => {
    const report = {
        type: 'data-cleanup-report',
        inventory: { totalFiles: 69041 },
        metadata: { entryPoints: ['github-cache/facebook-react/index.js'] },
        allFindings: [{ path: 'github-cache/aws-aws-cli/bin/aws', type: 'unused-file' }]
    };
    assert.equal(isStaleFileReductionScan(report), true);
});

test('normalizeFileReductionReport strips benchmark-cache findings from stale export', () => {
    const reportPath = '/tmp/file-reduction-example-export.json';
    if (!fs.existsSync(reportPath)) {
        return;
    }
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const normalized = normalizeFileReductionReport(report);

    assert.equal(normalized.scanScope.reportHealth, 'stale-full-tree-scan');
    assert.equal(normalized.scanScope.rescanRecommended, true);
    assert.equal(normalized.summary.unusedFileCandidates, 0);
    assert.equal(
        normalized.allFindings.some((finding) => String(finding.path || '').includes('github-cache')),
        false
    );
    assert.ok(normalized.scanScope.benchmarkCacheFindingsExcluded >= 0);
});

test('normalizeFileReductionReport strips legacy unused-file false positives', () => {
    const report = {
        type: 'data-cleanup-report',
        inventory: { totalFiles: 2331 },
        findings: {
            buildArtifacts: [{
                type: 'build-artifact',
                category: 'node_modules',
                severity: 'low',
                path: 'node_modules'
            }],
            unusedFiles: [
                { type: 'unused-file', severity: 'medium', path: 'batch_consolidator.py' },
                { type: 'unused-file', severity: 'medium', path: 'standardized_schema.json' }
            ],
            assetConsolidation: [],
            configManagement: [],
            dependencyHealth: [],
            environmentVariables: [],
            dataFreshness: [],
            dataAccessPatterns: [],
            dataPrivacy: [],
            dataLineage: [],
            dataConsistency: []
        },
        scanScope: { reportHealth: 'platform-scoped' }
    };
    const normalized = normalizeFileReductionReport(report);
    assert.equal(normalized.summary.unusedFileCandidates, 0);
    assert.equal(normalized.summary.totalFindings, 1);
    assert.equal(normalized.findings.unusedFiles.length, 0);
});

test('globMatch supports **/exact-filename patterns', () => {
    assert.equal(globMatch('standardized_schema.json', '**/standardized_schema.json'), true);
    assert.equal(globMatch('schemas/standardized_schema.json', '**/standardized_schema.json'), true);
    assert.equal(globMatch('batch_consolidator.py', '**/batch_consolidator.py'), true);
    assert.equal(globMatch('mock_data_consolidator.py', '**/mock_data_*'), true);
    assert.equal(globMatch('other.json', '**/standardized_schema.json'), false);
});

test('parseHtmlReferences resolves dashboard css when html lives under web/', () => {
    const os = require('os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-html-'));
    try {
        const htmlRel = 'web/simplebeacon-dashboard/index.html';
        const cssRel = 'web/simplebeacon-dashboard/css/theme.css';
        fs.mkdirSync(path.dirname(path.join(root, cssRel)), { recursive: true });
        fs.writeFileSync(path.join(root, htmlRel), '<link rel="stylesheet" href="/simplebeacon-dashboard/css/theme.css?v=1">', 'utf8');
        fs.writeFileSync(path.join(root, cssRel), 'body{}', 'utf8');

        const { parseHtmlReferences } = require('../src/analyzers/file-reduction/utils/file-reference-tracker');
        const refs = parseHtmlReferences(fs.readFileSync(path.join(root, htmlRel), 'utf8'), path.join(root, htmlRel), root);
        assert.equal(refs.length, 1);
        assert.ok(refs[0].resolvedPath.endsWith(`${path.sep}theme.css`));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
