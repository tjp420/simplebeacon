/**
 * Integration test: spawn simplebeacon-mcp over stdio and exercise MCP JSON-RPC.
 */
const { spawn } = require('child_process');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const MCP_BIN = path.join(__dirname, '../bin/simplebeacon-mcp.js');
const PROJECT_ROOT = path.join(__dirname, '../../..');

function sendMcpSession(messages) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [MCP_BIN, '--offline'], {
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                SIMPLEBEACON_PROJECT_ROOT: PROJECT_ROOT,
                SIMPLEBEACON_OFFLINE: '1'
            },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', () => { /* ignore */ });
        child.on('error', reject);

        for (const message of messages) {
            child.stdin.write(`${JSON.stringify(message)}\n`);
        }
        child.stdin.end();

        child.on('close', (exitCode) => {
            const lines = stdout
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => JSON.parse(l));
            resolve({ lines, exitCode });
        });
    });
}

const INIT = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mcp-integration-test', version: '1.0.0' }
    }
};

const INITIALIZED = { jsonrpc: '2.0', method: 'notifications/initialized' };

test('MCP stdio: initialize, tools/list, scan_snippet, gate_status', async () => {
    const { lines, exitCode } = await sendMcpSession([
        INIT,
        INITIALIZED,
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
                name: 'scan_snippet',
                arguments: {
                    content: "import x from '../web/data/status-sample.json';\n",
                    filePath: 'src/handler.js',
                    projectRoot: PROJECT_ROOT
                }
            }
        },
        {
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: {
                name: 'gate_status',
                arguments: { projectRoot: PROJECT_ROOT, limit: 3 }
            }
        }
    ]);

    assert.equal(exitCode, 0);

    const init = lines.find((m) => m.id === 1);
    assert.equal(init?.result?.serverInfo?.name, 'simplebeacon');

    const toolList = lines.find((m) => m.id === 2);
    assert.equal(toolList?.result?.tools?.length, 4);

    const snippet = lines.find((m) => m.id === 3);
    const snippetPayload = JSON.parse(snippet.result.content[0].text);
    assert.ok(snippetPayload.findingCount >= 1);
    assert.equal(snippetPayload.localOnly, true);

    const gate = lines.find((m) => m.id === 4);
    const gatePayload = JSON.parse(gate.result.content[0].text);
    assert.equal(gatePayload.ok, true);
    assert.equal(typeof gatePayload.gatePass, 'boolean');
});

test('MCP stdio: scan_file on real project file', async () => {
    const { lines } = await sendMcpSession([
        INIT,
        INITIALIZED,
        {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'scan_file',
                arguments: {
                    filePath: 'packages/simplebeacon-cli/README.md',
                    projectRoot: PROJECT_ROOT
                }
            }
        }
    ]);

    const fileResult = lines.find((m) => m.id === 2);
    const payload = JSON.parse(fileResult.result.content[0].text);
    assert.equal(payload.filePath, 'packages/simplebeacon-cli/README.md');
    assert.ok(Array.isArray(payload.findings));
});

test('MCP stdio: explain_finding tool', async () => {
    const { lines } = await sendMcpSession([
        INIT,
        INITIALIZED,
        {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'explain_finding',
                arguments: { patternId: 'SB-FICTION-001' }
            }
        }
    ]);

    const payload = JSON.parse(lines.find((m) => m.id === 2).result.content[0].text);
    assert.equal(payload.found, true);
    assert.equal(payload.usesLlm, false);
});
