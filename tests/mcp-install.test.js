const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildCursorMcpJson, installCursorMcpConfig } = require('../src/mcp/install-cursor-config');

test('buildCursorMcpJson defaults to npx local bin', () => {
    const json = buildCursorMcpJson();
    assert.equal(json.mcpServers.simplebeacon.command, 'npx');
    assert.deepEqual(json.mcpServers.simplebeacon.args, ['simplebeacon-mcp', '--offline']);
});

test('buildCursorMcpJson npx-github uses -p simplebeacon for zero-install', () => {
    const json = buildCursorMcpJson({ mode: 'npx-github' });
    assert.equal(json.mcpServers.simplebeacon.command, 'npx');
    assert.deepEqual(json.mcpServers.simplebeacon.args, [
        '--yes', '-p', 'simplebeacon', 'simplebeacon-mcp', '--offline'
    ]);
});

test('installCursorMcpConfig writes .cursor/mcp.json', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-mcp-init-'));
    const result = installCursorMcpConfig(tmp);
    assert.equal(result.created, true);
    assert.ok(fs.existsSync(result.configPath));
    const parsed = JSON.parse(fs.readFileSync(result.configPath, 'utf8'));
    assert.ok(parsed.mcpServers.simplebeacon);
});
