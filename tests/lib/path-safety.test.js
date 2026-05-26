const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    normalizePathKey,
    isPathWithinRoot,
    resolveCliProjectRoot,
    resolveSafeRelativePath
} = require('../../src/lib/path-utils');
const { ConfigError, PathError } = require('../../src/lib/errors');
const { sanitizeFilePath, sanitizeString } = require('../../src/lib/input-sanitizer');
const { resolvePathFromBase, loadSimplebeaconConfig } = require('../../src/config');

test('normalizePathKey lowercases and uses forward slashes', () => {
    const normalized = normalizePathKey('C:\\Project\\Web\\Data');
    assert.match(normalized, /^c:/);
    assert.ok(!normalized.includes('\\'));
});

test('isPathWithinRoot detects containment', () => {
    const root = path.join('C:', 'repo');
    assert.equal(isPathWithinRoot(path.join(root, 'web', 'data'), root), true);
    assert.equal(isPathWithinRoot(path.join('C:', 'other'), root), false);
});

test('resolveSafeRelativePath rejects traversal outside base', () => {
    const base = path.join(os.tmpdir(), 'simplebeacon-path-test-base');
    assert.throws(
        () => resolveSafeRelativePath(base, '../../outside'),
        ConfigError
    );
});

test('resolvePathFromBase rejects traversal outside base', () => {
    const base = path.join(os.tmpdir(), 'simplebeacon-config-path-test');
    assert.throws(
        () => resolvePathFromBase(base, '../escape'),
        ConfigError
    );
});

test('resolveCliProjectRoot requires an existing directory', () => {
    assert.throws(
        () => resolveCliProjectRoot(path.join(os.tmpdir(), 'missing-simplebeacon-dir')),
        PathError
    );
});

test('resolveCliProjectRoot resolves existing temp directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simplebeacon-root-'));
    try {
        const resolved = resolveCliProjectRoot(dir);
        assert.equal(normalizePathKey(resolved), normalizePathKey(dir));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('sanitizeFilePath strips control characters', () => {
    assert.equal(sanitizeFilePath(' web/data \x00'), 'web/data');
});

test('sanitizeString trims and limits length', () => {
    assert.equal(sanitizeString('  hello  '), 'hello');
    assert.equal(sanitizeString('x'.repeat(1200)).length, 1000);
});

test('loadSimplebeaconConfig throws ConfigError for explicit invalid config', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'simplebeacon-config-invalid-'));
    const configPath = path.join(root, '.simplebeacon', 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, '{ invalid json', 'utf8');

    try {
        assert.throws(
            () => loadSimplebeaconConfig(root, configPath),
            (error) => error instanceof ConfigError && error.code === 'CONFIG_ERROR'
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
