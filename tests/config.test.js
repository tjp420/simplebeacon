const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
    loadSimplebeaconConfig,
    getInitTemplates,
    mergeBaseline,
    resolveScanPaths
} = require('../src/config');
const { validateConfig } = require('../src/config-schema');
const { detectProjectProfile, resolvePlatformRoot } = require('../src/project-detect');
const { initSimplebeacon } = require('../src/index');

const AI_PLATFORM = path.join(__dirname, '../../..');

test('validateConfig rejects invalid scanPaths type', () => {
    const result = validateConfig({ scanPaths: 'bad' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('scanPaths')));
});

test('detectProjectProfile finds cascade layout in ai-platform', () => {
    const detected = detectProjectProfile(AI_PLATFORM);
    assert.equal(detected.profile, 'cascade');
    assert.ok(detected.scanPaths.includes('web/data'));
});

test('getInitTemplates minimal profile disables dashboard rules', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'truthcheck-min-'));
    const templates = getInitTemplates(tmp, { profile: 'minimal' });
    assert.equal(templates.profile, 'minimal');
    assert.equal(templates.config.rules['json-schema'].enabled, false);
    assert.equal(templates.config.rules.credentials.enabled, true);
});

test('initSimplebeacon creates config in empty directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'truthcheck-init-'));
    const result = initSimplebeacon(tmp, { profile: 'minimal' });
    assert.equal(result.configCreated, true);
    assert.equal(result.baselineCreated, true);
    assert.ok(fs.existsSync(result.configPath));
    const config = JSON.parse(fs.readFileSync(result.configPath, 'utf8'));
    assert.equal(config.profile, 'minimal');
});

test('loadSimplebeaconConfig auto-detects cascade profile', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'truthcheck-cascade-'));
    fs.mkdirSync(path.join(tmp, 'web', 'data'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'web', 'dashboard-new.html'), '<!-- cascade layout -->');

    const config = loadSimplebeaconConfig(tmp);
    assert.equal(config.profile, 'cascade');
    assert.ok(Array.isArray(config.productionPaths));
});

test('mergeBaseline uses empty fiction for minimal profile', () => {
    const baseline = mergeBaseline(null, 'minimal');
    assert.deepEqual(baseline.rejectedFiction, {});
});

test('mergeBaseline unions rejectedFiction arrays with profile defaults', () => {
    const baseline = mergeBaseline({
        rejectedFiction: {
            completionRates: [74.17, 66]
        }
    }, 'cascade');
    assert.ok(baseline.rejectedFiction.completionRates.includes(62));
    assert.ok(baseline.rejectedFiction.completionRates.includes(74.17));
    assert.ok(baseline.rejectedFiction.modelNames.includes('demo-oracle'));
});

test('resolveScanPaths ignores project root when passed as extra path', () => {
    const config = loadSimplebeaconConfig(AI_PLATFORM);
    const paths = resolveScanPaths(AI_PLATFORM, config, [AI_PLATFORM]);
    assert.ok(!paths.some((p) => path.resolve(p).toLowerCase() === path.resolve(AI_PLATFORM).toLowerCase()));
    assert.ok(paths.some((p) => p.includes('web') && p.includes('data')));
});

test('resolveScanPaths ignores monorepo parent when passed as extra path', () => {
    const config = loadSimplebeaconConfig(AI_PLATFORM);
    const parent = path.join(AI_PLATFORM, '..');
    const paths = resolveScanPaths(AI_PLATFORM, config, [parent]);
    assert.ok(!paths.some((p) => path.resolve(p).toLowerCase() === path.resolve(parent).toLowerCase()));
    assert.ok(paths.some((p) => p.includes('web') && p.includes('data')));
});

test('resolveScanPaths keeps configured child paths when extra matches scanPaths', () => {
    const config = loadSimplebeaconConfig(AI_PLATFORM);
    const webData = path.join(AI_PLATFORM, 'web', 'data');
    const paths = resolveScanPaths(AI_PLATFORM, config, [webData]);
    const webDataCount = paths.filter((p) => path.resolve(p).toLowerCase() === webData.toLowerCase()).length;
    assert.equal(webDataCount, 1);
});

test('resolvePlatformRoot finds ai-platform when scanning parent workspace', () => {
    const parent = path.join(AI_PLATFORM, '..');
    const resolved = resolvePlatformRoot(parent);
    assert.equal(path.resolve(resolved.platformRoot).toLowerCase(), path.resolve(AI_PLATFORM).toLowerCase());
    assert.equal(path.resolve(resolved.scanRoot).toLowerCase(), path.resolve(parent).toLowerCase());
});
