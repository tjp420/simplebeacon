const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    validateJSON,
    validateNotEmpty,
    validateGitHook
} = require('../../src/lib/file-validator');

test('validates valid JSON file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-valid-json-'));
    const testFile = path.join(dir, 'valid.json');
    fs.writeFileSync(testFile, '{"valid": true}');

    assert.equal(validateJSON(testFile), true);

    fs.rmSync(dir, { recursive: true, force: true });
});

test('rejects invalid JSON file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-invalid-json-'));
    const testFile = path.join(dir, 'invalid.json');
    fs.writeFileSync(testFile, '{invalid json}');

    assert.equal(validateJSON(testFile), false);

    fs.rmSync(dir, { recursive: true, force: true });
});

test('validates non-empty file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-notempty-'));
    const testFile = path.join(dir, 'content.json');
    fs.writeFileSync(testFile, '{"content": true}');

    assert.equal(validateNotEmpty(testFile), true);

    fs.rmSync(dir, { recursive: true, force: true });
});

test('rejects empty file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-empty-'));
    const testFile = path.join(dir, 'empty.json');
    fs.writeFileSync(testFile, '');

    assert.equal(validateNotEmpty(testFile), false);

    fs.rmSync(dir, { recursive: true, force: true });
});

test('validates git hook script shape', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-hook-'));
    const hookPath = path.join(dir, 'pre-commit');
    fs.writeFileSync(hookPath, '#!/usr/bin/env sh\nnpx simplebeacon scan --gate\n');

    assert.equal(validateGitHook(hookPath), true);

    fs.rmSync(dir, { recursive: true, force: true });
});
