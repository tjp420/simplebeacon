const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
    isExternalBenchmarkCachePath,
    partitionBenchmarkIssues
} = require('../src/lib/benchmark-cache-paths');
const { resolveEffectiveScanPaths } = require('../src/scan');

const AI_PLATFORM = path.join(__dirname, '../../..');

test('isExternalBenchmarkCachePath detects github-cache clones', () => {
    assert.equal(
        isExternalBenchmarkCachePath('github-cache/facebook-react/tsconfig.json'),
        true
    );
    assert.equal(
        isExternalBenchmarkCachePath('java-ai-vulnerable/cycode-sca.html'),
        true
    );
    assert.equal(
        isExternalBenchmarkCachePath('server/routes/api.js'),
        false
    );
});

test('partitionBenchmarkIssues splits platform vs cache noise', () => {
    const { platformIssues, benchmarkCacheIssues, excludedScanNoiseIssues } = partitionBenchmarkIssues([
        { filePath: 'web/data/foo-sample.json', type: 'Schema' },
        { filePath: 'github-cache/aws-aws-cli/package.json', type: 'Invalid JSON' },
        { filePath: '.simplebeacon/credential-incident-triage.json', type: 'Credential Pattern' },
        { filePath: 'packages/simplebeacon-cli/tests/rules.test.js', type: 'Credential Pattern' }
    ]);
    assert.equal(platformIssues.length, 1);
    assert.equal(benchmarkCacheIssues.length, 1);
    assert.equal(excludedScanNoiseIssues.length, 2);
});

test('resolveEffectiveScanPaths uses web/data for ai-platform, not full tree', () => {
    const paths = resolveEffectiveScanPaths(AI_PLATFORM, AI_PLATFORM, {
        scanPaths: ['web/data']
    });
    const platformKey = path.resolve(AI_PLATFORM).replace(/\\/g, '/').toLowerCase();
    for (const p of paths) {
        const key = path.resolve(p).replace(/\\/g, '/').toLowerCase();
        assert.notEqual(key, platformKey, `should not walk full platform root: ${p}`);
    }
    assert.ok(paths.some((p) => /web[\\/]data$/i.test(p)));
});
