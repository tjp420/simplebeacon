const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
    resolveEffectiveScanPaths,
    computeFilesAnalyzed
} = require('../src/scan');
const { resolvePlatformRoot } = require('../src/project-detect');

const AI_PLATFORM = path.join(__dirname, '../../..');

test('resolvePlatformRoot walks up from web/data to ai-platform', () => {
    const webData = path.join(AI_PLATFORM, 'web/data');
    const { scanRoot, platformRoot } = resolvePlatformRoot(webData);
    assert.equal(path.resolve(scanRoot), path.resolve(webData));
    assert.equal(path.resolve(platformRoot), path.resolve(AI_PLATFORM));
});

test('resolveEffectiveScanPaths narrows to requested subpath under platform', () => {
    const webData = path.join(AI_PLATFORM, 'web/data');
    const paths = resolveEffectiveScanPaths(webData, AI_PLATFORM, {
        scanPaths: ['web/data', 'data/mock']
    });
    assert.deepEqual(paths, [webData]);
});

test('resolveEffectiveScanPaths honors local config for isolated honey-pot repos', () => {
    const paths = resolveEffectiveScanPaths('/tmp/client-repo', '/tmp/client-repo', {
        scanPaths: ['web/data', 'data/mock']
    });
    assert.ok(paths.some((p) => /web[\\/]data$/i.test(p)));
    assert.ok(paths.some((p) => /data[\\/]mock$/i.test(p)));
});

test('resolveEffectiveScanPaths uses configured paths for platform root', () => {
    const paths = resolveEffectiveScanPaths(AI_PLATFORM, AI_PLATFORM, {
        scanPaths: ['web/data', 'data/mock']
    });
    assert.ok(paths.some((p) => p.endsWith('web\\data') || p.endsWith('web/data')));
    assert.ok(paths.some((p) => p.endsWith('data\\mock') || p.endsWith('data/mock')));
});

test('computeFilesAnalyzed uses the broadest rule coverage', () => {
    assert.equal(computeFilesAnalyzed(42, { scanned: 117 }, { scanned: 70 }, { scanned: 90 }), 117);
    assert.equal(computeFilesAnalyzed(10, { scanned: 8 }, { scanned: 0 }, { scanned: 0 }), 10);
});
