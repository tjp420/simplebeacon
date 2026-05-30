/**
 * Minimal MCP stdio server (JSON-RPC 2.0) — zero extra npm dependencies.
 * Implements tools/list + tools/call for Cursor, Claude Desktop, etc.
 */

const readline = require('readline');
const { TOOL_DEFINITIONS, createMcpToolHandlers } = require('./tools');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'simplebeacon', version: '1.0.0' };

function createMcpStdioServer(options = {}) {
    const handlers = createMcpToolHandlers(options);
    let initialized = false;

    function send(message) {
        process.stdout.write(`${JSON.stringify(message)}\n`);
    }

    function toolListResult() {
        return {
            tools: TOOL_DEFINITIONS.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema
            }))
        };
    }

    function handleRequest(message) {
        const { id, method, params } = message;

        if (method === 'initialize') {
            send({
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: PROTOCOL_VERSION,
                    capabilities: { tools: {} },
                    serverInfo: SERVER_INFO
                }
            });
            initialized = true;
            return;
        }

        if (!initialized && method !== 'ping') {
            send({
                jsonrpc: '2.0',
                id,
                error: { code: -32002, message: 'Server not initialized' }
            });
            return;
        }

        if (method === 'ping') {
            send({ jsonrpc: '2.0', id, result: {} });
            return;
        }

        if (method === 'tools/list') {
            send({ jsonrpc: '2.0', id, result: toolListResult() });
            return;
        }

        if (method === 'tools/call') {
            const name = params?.name;
            const args = params?.arguments || {};
            const handler = handlers[name];

            if (!handler) {
                send({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                        isError: true
                    }
                });
                return;
            }

            try {
                const result = handler(args);
                send({ jsonrpc: '2.0', id, result });
            } catch (err) {
                send({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [{ type: 'text', text: err.message || 'Tool failed' }],
                        isError: true
                    }
                });
            }
            return;
        }

        if (id !== undefined) {
            send({
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: `Method not found: ${method}` }
            });
        }
    }

    function handleNotification(message) {
        if (message.method === 'notifications/initialized') {
            initialized = true;
        }
    }

    function start() {
        const rl = readline.createInterface({
            input: process.stdin,
            crlfDelay: Infinity
        });

        rl.on('line', (line) => {
            const trimmed = line.trim();
            if (!trimmed) return;

            let message;
            try {
                message = JSON.parse(trimmed);
            } catch {
                return;
            }

            if (message.method && message.id === undefined) {
                handleNotification(message);
                return;
            }

            handleRequest(message);
        });

        rl.on('close', () => {
            process.exit(0);
        });
    }

    return { start, toolListResult, handlers };
}

module.exports = {
    createMcpStdioServer,
    PROTOCOL_VERSION,
    SERVER_INFO
};
