const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { installCursorMcpConfig } = require('../src/mcp/install-cursor-config');
const {
    installCursorRule,
    installCiWorkflow,
    installDeveloperStack
} = require('../src/lib/developer-onboarding');

test('buildCursorMcpJson defaults to npx local bin', () => {
    const json = installCursorMcpConfig;
    const { buildCursorMcpJson } = require('../src/mcp/install-cursor-config');
    const parsed = buildCursorMcpJson();
    assert.equal(parsed.mcpServers.simplebeacon.command, 'npx');
});

test('installDeveloperStack writes mcp, rule, and ci workflow', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-onboard-'));
    const result = installDeveloperStack(tmp, {
        withMcp: true,
        withCursorRule: true,
        withCi: true
    });
    assert.equal(result.mcp.created, true);
    assert.equal(result.cursorRule.created, true);
    assert.equal(result.ciWorkflow.created, true);
    assert.ok(fs.existsSync(path.join(tmp, '.cursor', 'mcp.json')));
    assert.ok(fs.existsSync(path.join(tmp, '.cursor', 'rules', 'simplebeacon-scan-workflow.mdc')));
    assert.ok(fs.existsSync(path.join(tmp, '.github', 'workflows', 'simplebeacon.yml')));
});

test('installCiWorkflow skips existing file without force', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-ci-'));
    installCiWorkflow(tmp);
    const second = installCiWorkflow(tmp);
    assert.equal(second.skipped, true);
});
