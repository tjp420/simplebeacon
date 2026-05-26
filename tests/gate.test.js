const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI_ROOT = path.join(__dirname, '..');
const AI_PLATFORM = path.join(CLI_ROOT, '../..');
const BIN = path.join(CLI_ROOT, 'bin/simplebeacon.js');

function runSimplebeacon(args, cwd) {
    return spawnSync(process.execPath, [BIN, ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1' }
    });
}

test('ai-platform simplebeacon --gate exits 0 with cascade config', () => {
    const configPath = path.join(AI_PLATFORM, '.simplebeacon/config.json');
    if (!fs.existsSync(configPath)) {
        return;
    }

    const result = runSimplebeacon(['scan', '--gate', '--path', AI_PLATFORM, '--format', 'text'], AI_PLATFORM);
    assert.equal(
        result.status,
        0,
        `gate failed:\n${result.stdout}\n${result.stderr}`
    );
    assert.match(result.stdout, /Gate: PASS/i);
});

test('ai-platform gate report has zero high-severity issues', () => {
    const configPath = path.join(AI_PLATFORM, '.simplebeacon/config.json');
    if (!fs.existsSync(configPath)) {
        return;
    }

    const outFile = path.join(AI_PLATFORM, '.simplebeacon/gate-test-report.json');
    const result = runSimplebeacon([
        'scan',
        '--path', AI_PLATFORM,
        '--format', 'json',
        '--output', outFile
    ], AI_PLATFORM);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    assert.equal(report.severityCounts?.high ?? 0, 0);
    assert.equal(report.severityCounts?.critical ?? 0, 0);
    assert.equal(
        (report.rawIssues || []).filter((i) => i.type === 'Fictional KPI').length,
        0
    );
});

test('parent workspace scan resolves ai-platform mock data paths', () => {
    const configPath = path.join(AI_PLATFORM, '.simplebeacon/config.json');
    if (!fs.existsSync(configPath)) {
        return;
    }

    const parent = path.join(AI_PLATFORM, '..');
    const outFile = path.join(parent, '.simplebeacon/parent-scan-test-report.json');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });

    const result = runSimplebeacon([
        'scan',
        '--path', parent,
        '--format', 'json',
        '--output', outFile
    ], AI_PLATFORM);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    assert.ok(report.totalFiles > 0, `expected mock files, got ${report.totalFiles}`);
    assert.equal(
        path.resolve(report.platformRoot || '').toLowerCase(),
        path.resolve(AI_PLATFORM).toLowerCase()
    );
    assert.ok(
        (report.scanPaths || []).some((p) => p.replace(/\\/g, '/').includes('ai-platform/web/data')),
        `scanPaths should include ai-platform/web/data: ${JSON.stringify(report.scanPaths)}`
    );
});
