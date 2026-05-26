const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { withTransactionSync } = require('../../src/lib/transaction-manager');

test('successful operation completes transaction', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-tx-'));
    const testFile = path.join(dir, 'test-transaction.json');
    fs.writeFileSync(testFile, '{"original": true}');

    const result = withTransactionSync((transaction) => {
        transaction.addFile(testFile);
        fs.writeFileSync(testFile, '{"modified": true}');
        return 'success';
    });

    assert.equal(result, 'success');
    assert.equal(fs.readFileSync(testFile, 'utf8'), '{"modified": true}');

    fs.rmSync(dir, { recursive: true, force: true });
});

test('failed operation rolls back transaction', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-rollback-'));
    const testFile = path.join(dir, 'test-rollback.json');
    fs.writeFileSync(testFile, '{"original": true}');

    assert.throws(() => {
        withTransactionSync((transaction) => {
            transaction.addFile(testFile);
            fs.writeFileSync(testFile, '{"modified": true}');
            throw new Error('Operation failed');
        });
    }, /Operation failed/);

    assert.equal(fs.readFileSync(testFile, 'utf8'), '{"original": true}');

    fs.rmSync(dir, { recursive: true, force: true });
});
