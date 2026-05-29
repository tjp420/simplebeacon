const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    filterPlatformArtifactPaths,
    isBenchmarkCachePath,
    classifyRegenerableArtifacts
} = require('../src/lib/complete-scan-artifact-profile');

test('isBenchmarkCachePath detects clone trees', () => {
    assert.equal(isBenchmarkCachePath('github-cache/facebook-react/package.json'), true);
    assert.equal(isBenchmarkCachePath('node_modules/foo'), false);
});

test('filterPlatformArtifactPaths removes benchmark rows', () => {
    const filtered = filterPlatformArtifactPaths([
        { path: 'node_modules', bytes: 100, files: 10, category: 'node_modules' },
        { path: 'github-cache/foo/bar/node_modules', bytes: 50, files: 5, category: 'node_modules' }
    ]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].path, 'node_modules');
});

test('classifyRegenerableArtifacts ignores github-cache-only top dirs', () => {
    const profile = classifyRegenerableArtifacts({
        fileReduction: {
            safeToDeleteBytes: 0,
            reviewBeforeDeleteBytes: 0,
            unusedFileCandidates: 0,
            topSafeDirectories: [
                { path: 'github-cache/clone/node_modules', bytes: 1000, files: 1, category: 'node_modules' }
            ]
        }
    });
    assert.equal(profile, 'empty');
});
