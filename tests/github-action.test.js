const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'simplebeacon.js');
const WORKFLOW = path.join(ROOT, 'examples', 'github-action', 'simplebeacon.yml');

function runSimplebeacon(args, cwd) {
    return spawnSync(process.execPath, [BIN, ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1' }
    });
}

test('github action workflow includes gate scan and PR summary', () => {
    const raw = fs.readFileSync(WORKFLOW, 'utf8');

    assert.match(raw, /^name: Simplebeacon/m);
    assert.match(raw, /pull_request:/);
    assert.match(raw, /simplebeacon scan/);
    assert.match(raw, /--gate/);
    assert.match(raw, /GITHUB_STEP_SUMMARY/);
    assert.match(raw, /upload-artifact@v4/);
});

test('CI simulation passes on clean minimal project', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simplebeacon-ci-clean-'));
    const configDir = path.join(dir, '.simplebeacon');

    try {
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, 'config.json'), `${JSON.stringify({
            profile: 'minimal',
            scanPaths: ['data'],
            productionPaths: ['src'],
            gate: { failOn: ['high'] },
            rules: {
                credentials: { enabled: true },
                'production-leak': { enabled: true, severity: 'high' },
                'fiction-kpi-patterns': { enabled: false },
                'json-schema': { enabled: false },
                'jest-baseline': { enabled: false }
            }
        }, null, 2)}\n`, 'utf8');

        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'module.exports = { ok: true };\n', 'utf8');

        const result = runSimplebeacon([
            'scan',
            '--gate',
            '--format', 'json',
            '--output', '.simplebeacon/report.json'
        ], dir);

        assert.equal(result.status, 0, result.stderr || result.stdout);
        assert.ok(fs.existsSync(path.join(dir, '.simplebeacon', 'report.json')));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('CI simulation fails gate when production code references mock path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simplebeacon-ci-block-'));
    const configDir = path.join(dir, '.simplebeacon');

    try {
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, 'config.json'), `${JSON.stringify({
            profile: 'minimal',
            scanPaths: ['data'],
            productionPaths: ['src'],
            gate: { failOn: ['high'] },
            rules: {
                credentials: { enabled: false },
                'production-leak': { enabled: true, severity: 'high' },
                'fiction-kpi-patterns': { enabled: false },
                'json-schema': { enabled: false },
                'jest-baseline': { enabled: false }
            }
        }, null, 2)}\n`, 'utf8');

        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'src', 'loader.js'),
            'const path = require("path");\nmodule.exports = path.join("data", "status-sample.json");\n',
            'utf8'
        );

        const result = runSimplebeacon(['scan', '--gate'], dir);
        assert.notEqual(result.status, 0, 'expected gate failure for mock path in production code');
        assert.match(result.stderr + result.stdout, /Gate failed|blocking/i);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
