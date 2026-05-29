const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { scanTextContent } = require('../src/lib/credential-pattern-scanner');
const { scanFileContent, globMatch } = require('../src/rules/production-leak');
const { parseJestSummary, readJestResultCache, checkJestBaseline } = require('../src/rules/jest-baseline');
const { formatGithubComment } = require('../src/reporters/github-comment');
const { evaluateGate } = require('../src/gate');
const { formatTextReport, colorEnabled } = require('../src/reporters/text');

test('production-leak ignores scanner meta modules with audit exclusion catalogs', () => {
    const content = [
        "const SAMPLE_DATA_PREFIX = ['web', 'data'].join('/') + '/';",
        "const SAMPLE_JSON_SUFFIX = ['-', 'sample', '.json'].join('');",
        "return rel.endsWith(SAMPLE_JSON_SUFFIX);"
    ].join('\n');
    const findings = scanFileContent('server/lib/codebase-analyzer.js', content);
    assert.equal(findings.length, 0);
});

test('production-leak detects sample json reference', () => {
    const content = "const data = require('../web/data/users-sample.json');";
    const findings = scanFileContent('server/routes/users.js', content);
    assert.ok(findings.length > 0);
    assert.equal(findings[0].type, 'Production Leak');
    assert.equal(findings[0].severityBand, 'critical');
    assert.equal(findings[0].line, 1);
    assert.equal(findings[0].pattern, 'sample-json');
    assert.ok(findings[0].recommendation);
});

test('production-leak skips comment lines', () => {
    const content = "// const x = require('./foo-sample.json');";
    const findings = scanFileContent('server/routes/users.js', content);
    assert.equal(findings.length, 0);
});

test('production-leak ignores dev-tools page-spec metadata descriptions', () => {
    const content = 'description: `Validates ${label} registered dashboard page-spec JSON files`';
    const findings = scanFileContent('server/lib/dev-tools-workflows.js', content);
    assert.equal(findings.length, 0);
});

test('production-leak detects template literal mock paths', () => {
    const content = 'const p = `./fixtures/mock/users.json`;';
    const findings = scanFileContent('src/load.js', content);
    assert.ok(findings.some((f) => f.metadata.patternId === 'template-sample'));
});

test('production-leak ignores generic template json paths', () => {
    const content = 'const p = `./config/app-settings.json`;';
    const findings = scanFileContent('src/load.js', content);
    assert.equal(findings.length, 0);
});

test('production-leak ignores mock/sample prose in template literals', () => {
    const content = 'const msg = `Scope: mock/sample JSON files only — not a path`;';
    const findings = scanFileContent('server/services/cloud-inference-service.js', content);
    assert.equal(findings.length, 0);
});

test('production-leak ignores instructional template-sample wording', () => {
    const content = 'const msg = `Use the phrase "sample-suffix subset" instead of "template-sample".`;';
    const findings = scanFileContent('server/services/cloud-inference-service.js', content);
    assert.equal(findings.length, 0);
});

test('globMatch supports node_modules ignore', () => {
    assert.equal(globMatch('node_modules/foo/index.js', 'node_modules/**'), true);
    assert.equal(globMatch('server/routes/users.js', 'node_modules/**'), false);
});

test('globMatch supports test file patterns', () => {
    assert.equal(globMatch('tests/unit/foo.test.js', '**/*.test.js'), true);
    assert.equal(globMatch('server/routes/users.js', '**/*.test.js'), false);
});

test('credential scanner detects AWS key and allows demo placeholder', () => {
    const real = scanTextContent('secrets.json', '{"key":"AKIA1A2B3C4D5E6F7G8H"}');
    assert.ok(real.length > 0);
    assert.equal(real[0].severityBand, 'critical');
    assert.equal(real[0].line, 1);
    assert.equal(real[0].pattern, 'aws-access-key');
    assert.ok(real[0].recommendation);
    const demo = scanTextContent('auth.json', '{"password":"demo123","email":"dev@simplebeacon.ai"}');
    assert.equal(demo.length, 0);
});

test('credential scanner detects JWT pattern', () => {
    const token = 'eyJzzzzzzzzzzzzzzzz.eyJyyyyyyyyyyyyyyyyy.zzzzzzzzzzzzzzzzzzzz';
    const findings = scanTextContent('token.txt', token);
    assert.ok(findings.some((f) => f.metadata.patternId === 'jwt-token'));
});

test('parseJestSummary extracts pass counts', () => {
    const output = `
Test Suites: 27 passed, 27 total
Tests:       578 passed, 578 total
`;
    const summary = parseJestSummary(output);
    assert.equal(summary.testsPassed, 578);
    assert.equal(summary.suitesPassed, 27);
});

test('formatGithubComment includes gate and severities', () => {
    const body = formatGithubComment({
        qualityScore: 99,
        severityCounts: { high: 0, medium: 1, low: 0 },
        rawIssues: [{ severity: 'medium', type: 'Test', description: 'example' }]
    }, { pass: true });
    assert.match(body, /Simplebeacon/);
    assert.match(body, /PASS/);
});

test('evaluateGate fails on configured severities', () => {
    const report = {
        rawIssues: [{ severity: 'high', type: 'Credential Pattern', count: 1 }]
    };
    const result = evaluateGate(report, { failOn: ['high'], warnOn: ['medium'] });
    assert.equal(result.pass, false);
    assert.equal(result.blockingIssues.length, 1);
});

test('evaluateGate supports severityBand escalation', () => {
    const report = {
        rawIssues: [{ severity: 'high', severityBand: 'critical', type: 'Credential Pattern', count: 1 }]
    };
    const result = evaluateGate(report, { failOn: ['critical'], warnOn: ['high', 'medium'] });
    assert.equal(result.pass, false);
    assert.equal(result.blockingIssues.length, 1);
});

test('formatTextReport renders without color when NO_COLOR set', () => {
    const prev = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    const text = formatTextReport({ projectRoot: '/tmp', totalFiles: 0, qualityScore: 100, rawIssues: [] }, { pass: true });
    assert.match(text, /No issues detected/);
    assert.equal(colorEnabled(), false);
    if (prev == null) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = prev;
});

test('checkJestBaseline validates cached jest-result.json when runTests is false', async () => {
    const platformRoot = path.join(__dirname, '..', '..', '..');
    const result = await checkJestBaseline(platformRoot, {
        baseline: { jestTestsPassing: 894, jestTestsLabel: '894/894', jestSuites: 64 },
        runTests: false
    });
    assert.equal(result.checked, true);
    assert.equal(result.fromCache, true);
    assert.equal(result.passed, true);
    assert.equal(result.summary?.testsPassed, 894);
    assert.equal(result.issues.length, 0);
});
