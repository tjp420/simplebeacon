/**
 * Write Cursor MCP config so users can enable Simplebeacon without monorepo paths.
 */

const fs = require('fs');
const path = require('path');

function resolveMcpCommand(options = {}) {
    const mode = options.mode || 'npx-local';

    if (mode === 'monorepo') {
        return {
            command: 'node',
            args: ['packages/simplebeacon-cli/bin/simplebeacon-mcp.js', '--offline']
        };
    }

    if (mode === 'npx-github') {
        // Zero-install: package name is simplebeacon; bin is simplebeacon-mcp
        return {
            command: 'npx',
            args: ['--yes', '-p', 'simplebeacon', 'simplebeacon-mcp', '--offline']
        };
    }

    // Default: devDependency installed — npx resolves bin from node_modules/.bin
    return {
        command: 'npx',
        args: ['simplebeacon-mcp', '--offline']
    };
}

function buildCursorMcpJson(options = {}) {
    const { command, args } = resolveMcpCommand(options);
    return {
        mcpServers: {
            simplebeacon: {
                command,
                args,
                env: {
                    SIMPLEBEACON_PROJECT_ROOT: '${workspaceFolder}',
                    SIMPLEBEACON_OFFLINE: '1'
                }
            }
        }
    };
}

function buildClaudeDesktopMcpJson(options = {}) {
    const { command, args } = resolveMcpCommand(options);
    return {
        mcpServers: {
            simplebeacon: {
                command,
                args,
                env: {
                    SIMPLEBEACON_PROJECT_ROOT: '${workspaceFolder}',
                    SIMPLEBEACON_OFFLINE: '1'
                }
            }
        }
    };
}

function installCursorMcpConfig(projectRoot, options = {}) {
    const root = path.resolve(projectRoot);
    const cursorDir = path.join(root, '.cursor');
    const configPath = path.join(cursorDir, 'mcp.json');
    const force = Boolean(options.force);
    const dryRun = Boolean(options.dryRun);

    if (fs.existsSync(configPath) && !force) {
        return {
            skipped: true,
            configPath,
            message: 'Existing .cursor/mcp.json — use --force to overwrite'
        };
    }

    const payload = `${JSON.stringify(buildCursorMcpJson(options), null, 2)}\n`;

    if (dryRun) {
        return { dryRun: true, configPath, wouldWrite: payload };
    }

    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(configPath, payload, 'utf8');

    return {
        created: true,
        configPath,
        mode: options.mode || 'npx-local'
    };
}

module.exports = {
    buildCursorMcpJson,
    buildClaudeDesktopMcpJson,
    installCursorMcpConfig,
    resolveMcpCommand
};
