const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initSimplebeacon } = require('../src/index');
const { installSimplebeaconHook } = require('../src/hook-install');
const { writeManagedFileSync } = require('../src/lib/safe-write');
const { validateJSON, validateNotEmpty } = require('../src/lib/file-validator');

test('init dry-run does not create files', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-init-dryrun-'));
    const result = initSimplebeacon(testDir, { dryRun: true });

    assert.equal(result.dryRun, true);
    assert.equal(fs.existsSync(path.join(testDir, '.simplebeacon')), false);
    assert.ok(Array.isArray(result.plannedActions));

    fs.rmSync(testDir, { recursive: true, force: true });
});

test('hook install dry-run does not create files', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-hook-dryrun-'));

    const result = installSimplebeaconHook(testDir, { type: 'pre-commit', dryRun: true });

    assert.equal(result.dryRun, true);
    assert.equal(fs.existsSync(path.join(testDir, '.simplebeacon', 'hooks', 'pre-commit')), false);

    fs.rmSync(testDir, { recursive: true, force: true });
});

test('writeManagedFileSync rolls back invalid JSON writes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-safe-write-'));
    const testFile = path.join(dir, 'config.json');
    fs.writeFileSync(testFile, '{"original": true}\n');

    assert.throws(() => {
        writeManagedFileSync(testFile, '{invalid json', {
            force: true,
            validators: [validateJSON, validateNotEmpty]
        });
    }, /Validation failed/);

    assert.equal(fs.readFileSync(testFile, 'utf8'), '{"original": true}\n');

    fs.rmSync(dir, { recursive: true, force: true });
});

test('init force overwrite creates backup before replacing config', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-init-force-'));
    const simplebeaconDir = path.join(testDir, '.simplebeacon');
    fs.mkdirSync(simplebeaconDir, { recursive: true });
    const configPath = path.join(simplebeaconDir, 'config.json');
    fs.writeFileSync(configPath, '{"custom": true}\n');

    initSimplebeacon(testDir, { profile: 'minimal', force: true });

    const backups = fs.readdirSync(simplebeaconDir).filter((name) => name.includes('.simplebeacon-backup.'));
    assert.ok(backups.length >= 1);
    assert.notEqual(fs.readFileSync(configPath, 'utf8'), '{"custom": true}\n');

    fs.rmSync(testDir, { recursive: true, force: true });
});
