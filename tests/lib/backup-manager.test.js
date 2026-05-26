const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    createBackup,
    restoreFromBackup,
    cleanupOldBackups
} = require('../../src/lib/backup-manager');

test('creates backup of existing file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-backup-'));
    const testFile = path.join(dir, 'test-backup.json');
    fs.writeFileSync(testFile, '{"original": true}');

    const backupPath = createBackup(testFile);

    assert.ok(backupPath);
    assert.equal(fs.existsSync(backupPath), true);
    assert.equal(fs.readFileSync(backupPath, 'utf8'), '{"original": true}');

    fs.rmSync(dir, { recursive: true, force: true });
});

test('returns null for non-existent file', () => {
    const backupPath = createBackup(path.join(os.tmpdir(), 'non-existent-simplebeacon.json'));
    assert.equal(backupPath, null);
});

test('restores from backup successfully', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-restore-'));
    const testFile = path.join(dir, 'test-restore.json');
    fs.writeFileSync(testFile, '{"original": true}');

    const backupPath = createBackup(testFile);
    fs.writeFileSync(testFile, '{"modified": true}');

    assert.equal(restoreFromBackup(backupPath), true);
    assert.equal(fs.readFileSync(testFile, 'utf8'), '{"original": true}');

    fs.rmSync(dir, { recursive: true, force: true });
});

test('cleanupOldBackups keeps newest backups only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-backup-clean-'));
    const testFile = path.join(dir, 'config.json');
    fs.writeFileSync(testFile, '{"v":1}');

    const backups = [];
    for (let i = 0; i < 4; i += 1) {
        backups.push(createBackup(testFile));
        fs.writeFileSync(testFile, `{"v":${i + 2}}`);
    }

    cleanupOldBackups(dir, 2);
    const remaining = backups.filter((backupPath) => fs.existsSync(backupPath));
    assert.equal(remaining.length, 2);

    fs.rmSync(dir, { recursive: true, force: true });
});
