/**
 * MCP tool handlers — local-only, no network.
 */

const path = require('path');
const { scanSnippetContent, scanFileOnDisk, readGateStatus } = require('../lib/snippet-scanner');
const { explainFinding } = require('./rule-catalog');
const { createNetworkGuard } = require('../lib/trust-guard');

function resolveProjectRoot(override) {
    return path.resolve(override || process.env.SIMPLEBEACON_PROJECT_ROOT || process.cwd());
}

function formatToolResult(payload) {
    return {
        content: [{
            type: 'text',
            text: JSON.stringify(payload, null, 2)
        }]
    };
}

function createMcpToolHandlers(options = {}) {
    const offline = options.offline !== false
        || process.env.SIMPLEBEACON_OFFLINE === '1'
        || process.env.SIMPLEBEACON_OFFLINE === 'true';
    const networkGuard = offline ? createNetworkGuard({ label: 'simplebeacon-mcp' }) : null;

    function withGuard(fn) {
        return (...args) => {
            if (networkGuard) networkGuard.assertOfflineClean();
            const result = fn(...args);
            if (networkGuard) networkGuard.assertOfflineClean();
            return result;
        };
    }

    return {
        scan_snippet: withGuard(({ content, filePath, projectRoot }) => {
            const result = scanSnippetContent(String(content || ''), {
                filePath: filePath || 'snippet.txt',
                projectRoot: resolveProjectRoot(projectRoot)
            });
            return formatToolResult({
                ...result,
                localOnly: true,
                methodology: 'Deterministic regex — not LLM semantic review'
            });
        }),

        scan_file: withGuard(({ filePath, projectRoot }) => {
            if (!filePath) {
                return formatToolResult({ error: 'filePath is required' });
            }
            try {
                const result = scanFileOnDisk(resolveProjectRoot(projectRoot), filePath);
                return formatToolResult({ ...result, localOnly: true });
            } catch (err) {
                return formatToolResult({ error: err.message, filePath });
            }
        }),

        gate_status: withGuard(({ projectRoot, reportPath, limit }) => {
            const result = readGateStatus(resolveProjectRoot(projectRoot), {
                reportPath,
                limit: limit ? Number(limit) : 12
            });
            return formatToolResult(result);
        }),

        explain_finding: withGuard(({ patternId, type }) => {
            return formatToolResult(explainFinding(patternId, { type }));
        })
    };
}

const TOOL_DEFINITIONS = [
    {
        name: 'scan_snippet',
        description: 'Scan a code snippet or pasted content for AI-fiction KPIs, mock-path leaks, credential patterns, and LLM placeholder slop. Runs locally — no upload.',
        inputSchema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'Source text to scan' },
                filePath: { type: 'string', description: 'Virtual filename for context (e.g. src/api/handler.ts)' },
                projectRoot: { type: 'string', description: 'Project root for baseline.json (default: cwd or SIMPLEBEACON_PROJECT_ROOT)' }
            },
            required: ['content']
        }
    },
    {
        name: 'scan_file',
        description: 'Scan one file on disk within the project root using the same rules as scan_snippet.',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'Relative or absolute path within project' },
                projectRoot: { type: 'string', description: 'Project root (default: cwd)' }
            },
            required: ['filePath']
        }
    },
    {
        name: 'gate_status',
        description: 'Read latest .simplebeacon/report.json gate pass/fail and top blocking issues from a prior full scan.',
        inputSchema: {
            type: 'object',
            properties: {
                projectRoot: { type: 'string' },
                reportPath: { type: 'string', description: 'Override report path relative to project root' },
                limit: { type: 'number', description: 'Max blocking issues to return (default 12)' }
            }
        }
    },
    {
        name: 'explain_finding',
        description: 'Explain a pattern ID from scan results — deterministic rule metadata, not LLM inference.',
        inputSchema: {
            type: 'object',
            properties: {
                patternId: { type: 'string', description: 'Pattern or rule id from scan_snippet/scan_file' },
                type: { type: 'string', description: 'Optional finding type for fallback lookup' }
            },
            required: ['patternId']
        }
    }
];

module.exports = {
    createMcpToolHandlers,
    TOOL_DEFINITIONS,
    formatToolResult
};
