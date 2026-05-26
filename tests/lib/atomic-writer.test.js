const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { atomicWriteFileSync } = require('../../src/lib/atomic-writer');

test('atomic write creates file successfully', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-atomic-'));
    const testFile = path.join(dir, 'test-atomic.json');
    const content = '{"test": true}\n';

    atomicWriteFileSync(testFile, content);

    assert.equal(fs.existsSync(testFile), true);
    assert.equal(fs.readFileSync(testFile, 'utf8'), content);

    fs.rmSync(dir, { recursive: true, force: true });
});

test('atomic write handles failure gracefully', () => {
    const content = '{"test": true}\n';
    const invalidPath = path.join('\\\\?\\Z:\\invalid-simplebeacon-path', 'test.json');

    assert.throws(() => {
        atomicWriteFileSync(invalidPath, content);
    });
});
