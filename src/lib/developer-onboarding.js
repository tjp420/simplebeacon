/**
 * One-command developer onboarding: MCP config, Cursor rule, GitHub Action workflow.
 */

const fs = require('fs');
const path = require('path');
const { installCursorMcpConfig } = require('../mcp/install-cursor-config');

const PACKAGE_ROOT = path.join(__dirname, '..', '..');
const CURSOR_RULE_TEMPLATE = path.join(PACKAGE_ROOT, 'examples', 'cursor', 'simplebeacon-scan-workflow.mdc');
const CI_WORKFLOW_TEMPLATE = path.join(PACKAGE_ROOT, 'examples', 'github-action', 'simplebeacon.yml');

function writeIfAbsentOrForce(filePath, content, options = {}) {
    const force = Boolean(options.force);
    const dryRun = Boolean(options.dryRun);

    if (fs.existsSync(filePath) && !force) {
        return { skipped: true, path: filePath };
    }

    if (dryRun) {
        return { dryRun: true, path: filePath, wouldWrite: content };
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { created: true, path: filePath };
}

function installCursorRule(projectRoot, options = {}) {
    const target = path.join(path.resolve(projectRoot), '.cursor', 'rules', 'simplebeacon-scan-workflow.mdc');
    const content = fs.readFileSync(CURSOR_RULE_TEMPLATE, 'utf8');
    return writeIfAbsentOrForce(target, content, options);
}

function installCiWorkflow(projectRoot, options = {}) {
    const target = path.join(path.resolve(projectRoot), '.github', 'workflows', 'simplebeacon.yml');
    const content = fs.readFileSync(CI_WORKFLOW_TEMPLATE, 'utf8');
    return writeIfAbsentOrForce(target, content, options);
}

function installDeveloperStack(projectRoot, options = {}) {
    const results = {
        mcp: null,
        cursorRule: null,
        ciWorkflow: null
    };

    if (options.withMcp !== false) {
        results.mcp = installCursorMcpConfig(projectRoot, options);
    }

    if (options.withCursorRule) {
        results.cursorRule = installCursorRule(projectRoot, options);
    }

    if (options.withCi) {
        results.ciWorkflow = installCiWorkflow(projectRoot, options);
    }

    return results;
}

module.exports = {
    installCursorRule,
    installCiWorkflow,
    installDeveloperStack,
    CURSOR_RULE_TEMPLATE,
    CI_WORKFLOW_TEMPLATE
};
