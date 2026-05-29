const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shouldExcludePath } = require('../../src/lib/path-exclusion-filter');

test('shouldExcludePath blocks global defaults', () => {
    assert.equal(shouldExcludePath('node_modules/foo/index.js'), true);
    assert.equal(shouldExcludePath('.git/config'), true);
    assert.equal(shouldExcludePath('coverage/lcov.info'), true);
    assert.equal(shouldExcludePath('dist/bundle.js'), true);
    assert.equal(shouldExcludePath('build/output.js'), true);
    assert.equal(shouldExcludePath('archive/old-code.js'), true);
    assert.equal(shouldExcludePath('github-cache/microsoft-pyrit/package.json'), true);
    assert.equal(shouldExcludePath('deliverables/vendor-handoff/manifest.json'), true);
});

test('shouldExcludePath allows normal source files', () => {
    assert.equal(shouldExcludePath('server/routes/users.js'), false);
    assert.equal(shouldExcludePath('src/components/Button.jsx'), false);
    assert.equal(shouldExcludePath('lib/utils.js'), false);
    assert.equal(shouldExcludePath('packages/cli/index.js'), false);
});

test('shouldExcludePath respects user exclusions', () => {
    const userExclusions = ['dashboard-inline-core', 'gguf-data-service', 'temp_dashboard'];
    assert.equal(shouldExcludePath('packages/dashboard-inline-core/index.js', userExclusions), true);
    assert.equal(shouldExcludePath('services/gguf-data-service/api.js', userExclusions), true);
    assert.equal(shouldExcludePath('scripts/temp_dashboard/data.js', userExclusions), true);
    assert.equal(shouldExcludePath('server/routes/users.js', userExclusions), false);
});

test('shouldExcludePath combines defaults with user exclusions', () => {
    const userExclusions = ['custom-module'];
    assert.equal(shouldExcludePath('node_modules/foo/index.js', userExclusions), true); // default
    assert.equal(shouldExcludePath('packages/custom-module/index.js', userExclusions), true); // user
    assert.equal(shouldExcludePath('server/routes/users.js', userExclusions), false); // neither
});

test('shouldExcludePath handles empty user exclusions', () => {
    assert.equal(shouldExcludePath('node_modules/foo/index.js', []), true);
    assert.equal(shouldExcludePath('server/routes/users.js', []), false);
});

test('shouldExcludePath is case-insensitive for path matching', () => {
    const userExclusions = ['Dashboard-Core'];
    assert.equal(shouldExcludePath('packages/dashboard-core/index.js', userExclusions), true);
    assert.equal(shouldExcludePath('packages/Dashboard-Core/index.js', userExclusions), true);
});
