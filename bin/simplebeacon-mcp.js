#!/usr/bin/env node
/**
 * Simplebeacon MCP server — stdio transport, local-only scan tools.
 *
 * Cursor / Claude Desktop config:
 *   command: node
 *   args: ["/path/to/simplebeacon-cli/bin/simplebeacon-mcp.js", "--offline"]
 *   env: { SIMPLEBEACON_PROJECT_ROOT: "/your/repo" }
 *
 * Terminal smoke test (prints results and exits):
 *   node bin/simplebeacon-mcp.js --smoke-test
 */

const path = require('path');
const { createMcpStdioServer } = require('../src/mcp/stdio-server');
const { createMcpToolHandlers } = require('../src/mcp/tools');

const offline = process.argv.includes('--offline')
    || process.env.SIMPLEBEACON_OFFLINE === '1'
    || process.env.SIMPLEBEACON_OFFLINE === 'true';

function runSmokeTest() {
    const projectRoot = process.env.SIMPLEBEACON_PROJECT_ROOT || process.cwd();
    const handlers = createMcpToolHandlers({ offline: true });
    const server = createMcpStdioServer({ offline: true });
    const tools = server.toolListResult().tools.map((t) => t.name);

    process.stderr.write(`Simplebeacon MCP smoke test\n`);
    process.stderr.write(`  projectRoot: ${projectRoot}\n`);
    process.stderr.write(`  tools: ${tools.join(', ')}\n\n`);

    const snippet = JSON.parse(
        handlers.scan_snippet({
            content: "import data from '../web/data/status-sample.json';\n",
            filePath: 'src/example.js',
            projectRoot
        }).content[0].text
    );

    process.stderr.write(`scan_snippet: ${snippet.findingCount} finding(s), ${snippet.blockingCount} blocking\n`);
    if (snippet.findings[0]) {
        process.stderr.write(`  → [${snippet.findings[0].severity}] ${snippet.findings[0].description.slice(0, 72)}\n`);
    }

    const gate = JSON.parse(handlers.gate_status({ projectRoot, limit: 3 }).content[0].text);
    if (gate.ok) {
        process.stderr.write(`gate_status: ${gate.gatePass ? 'PASS' : 'REVIEW'} (${gate.blockingCount} blocking)\n`);
    } else {
        process.stderr.write(`gate_status: ${gate.error}\n`);
    }

    process.stderr.write('\nSmoke test OK — MCP server is ready for Cursor (stdio mode waits silently until connected).\n');
    process.exit(0);
}

if (process.argv.includes('--smoke-test')) {
    runSmokeTest();
} else {
    const server = createMcpStdioServer({ offline });
    server.start();
}
