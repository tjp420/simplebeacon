const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    SimplebeaconError,
    ConfigError,
    ScanError,
    PathError
} = require('../../src/lib/errors');

test('SimplebeaconError carries code and context', () => {
    const error = new SimplebeaconError('boom', 'TEST_CODE', { field: 'value' });
    assert.equal(error.name, 'SimplebeaconError');
    assert.equal(error.code, 'TEST_CODE');
    assert.equal(error.message, 'boom');
    assert.deepEqual(error.context, { field: 'value' });
    assert.ok(error instanceof Error);
});

test('typed errors inherit SimplebeaconError', () => {
    const configError = new ConfigError('bad config', { file: 'config.json' });
    const scanError = new ScanError('scan failed', { path: '/tmp' });
    const pathError = new PathError('bad path', { path: '/tmp' });

    assert.ok(configError instanceof SimplebeaconError);
    assert.ok(scanError instanceof SimplebeaconError);
    assert.ok(pathError instanceof SimplebeaconError);
    assert.equal(configError.code, 'CONFIG_ERROR');
    assert.equal(scanError.code, 'SCAN_ERROR');
    assert.equal(pathError.code, 'PATH_ERROR');
});
