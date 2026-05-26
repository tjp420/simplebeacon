const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildHookScript, installSimplebeaconHook } = require('../src/hook-install');

test('buildHookScript includes gate scan command', () => {
    const script = buildHookScript('pre-commit', { failOn: 'high' });
    assert.match(script, /npx simplebeacon scan --gate --fail-on high/);
    assert.match(script, /^#!\/usr\/bin\/env sh/m);
});

test('buildHookScript adds jest flag for pre-push', () => {
    const script = buildHookScript('pre-push', { failOn: 'high', withJest: true });
    assert.match(script, /--with-jest/);
});

test('installSimplebeaconHook writes manual hook outside git repo', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-hook-'));
    const result = installSimplebeaconHook(tmp, { type: 'pre-commit' });
    assert.equal(result.manual, true);
    assert.ok(fs.existsSync(result.hookPath));
    const contents = fs.readFileSync(result.hookPath, 'utf8');
    assert.match(contents, /simplebeacon scan --gate/);
});
