/**
 * Compare Jest test results against .simplebeacon/baseline.json
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { writeManagedFileSync } = require('../lib/safe-write');
const { validateJSON, validateNotEmpty } = require('../lib/file-validator');

function parseJestSummary(output) {
    const text = String(output || '');
    const testsMatch = text.match(/Tests:\s+(?:(\d+) failed,\s*)?(?:(\d+) skipped,\s*)?(\d+) passed,\s*(\d+) total/);
    const suitesMatch = text.match(/Test Suites:\s+(?:(\d+) failed,\s*)?(?:(\d+) skipped,\s*)?(\d+) passed,\s*(\d+) total/);

    if (!testsMatch) return null;

    return {
        testsPassed: parseInt(testsMatch[3], 10),
        testsTotal: parseInt(testsMatch[4], 10),
        testsFailed: parseInt(testsMatch[1] || '0', 10),
        suitesPassed: suitesMatch ? parseInt(suitesMatch[3], 10) : null,
        suitesTotal: suitesMatch ? parseInt(suitesMatch[4], 10) : null
    };
}

function runCommand(cwd, command, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env, CI: process.env.CI || 'true' };
        // npm 11 warns on unknown "devdir" config if inherited via environment.
        delete env.npm_config_devdir;
        delete env.NPM_CONFIG_DEVDIR;
        const child = spawn(command, {
            cwd,
            shell: true,
            env
        });

        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error(`Jest command timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });

        child.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });

        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr, output: `${stdout}\n${stderr}` });
        });
    });
}

async function checkJestBaseline(baseDir, options = {}) {
    const baseline = options.baseline || {};
    const expectedPassing = baseline.jestTestsPassing;
    const expectedLabel = baseline.jestTestsLabel;
    const runTests = options.runTests === true;
    const testCommand = options.testCommand || 'npm test -- --no-coverage --passWithNoTests';

    if (expectedPassing == null && !expectedLabel) {
        return { checked: false, passed: true, issues: [], summary: null };
    }

    if (!runTests) {
        return {
            checked: false,
            passed: true,
            skipped: true,
            issues: [],
            summary: null,
            note: 'jest-baseline skipped (runTests:false) — enable runTests or pass --with-jest'
        };
    }

    let result;
    try {
        result = await runCommand(baseDir, testCommand, options.timeoutMs || 120000);
    } catch (error) {
        return {
            checked: true,
            passed: false,
            issues: [{
                id: 'jest-baseline-exec',
                severity: 'high',
                type: 'Jest Baseline',
                filePath: 'package.json',
                count: 1,
                description: `Jest command failed: ${error.message}`,
                recommendedAction: 'Fix test runner or update testCommand in .simplebeacon/config.json',
                affectedFiles: ['package.json']
            }],
            summary: null
        };
    }

    const summary = parseJestSummary(result.output);
    const issues = [];

    if (!summary) {
        issues.push({
            id: 'jest-baseline-parse',
            severity: 'high',
            type: 'Jest Baseline',
            filePath: 'jest',
            count: 1,
            description: 'Could not parse Jest summary from test output',
            recommendedAction: 'Ensure npm test prints standard Jest summary lines',
            affectedFiles: ['package.json']
        });
    } else if (summary.testsFailed > 0 || result.code !== 0) {
        issues.push({
            id: 'jest-baseline-failed',
            severity: 'high',
            type: 'Jest Baseline',
            filePath: 'jest',
            count: summary.testsFailed || 1,
            description: `Jest reported failures — ${summary.testsPassed}/${summary.testsTotal} passed`,
            recommendedAction: 'Fix failing tests before merge',
            affectedFiles: ['tests/'],
            metadata: summary
        });
    } else if (expectedPassing != null && summary.testsPassed !== expectedPassing) {
        issues.push({
            id: 'jest-baseline-mismatch',
            severity: 'high',
            type: 'Jest Baseline',
            filePath: 'jest',
            count: 1,
            description: `Jest count ${summary.testsPassed}/${summary.testsTotal} (expected ${expectedLabel || expectedPassing})`,
            recommendedAction: 'Run npm test and sync .simplebeacon/baseline.json jestTestsPassing',
            affectedFiles: ['.simplebeacon/baseline.json'],
            metadata: { ...summary, expectedPassing, expectedLabel }
        });
    } else if (baseline.jestSuites != null && summary.suitesPassed != null && summary.suitesPassed !== baseline.jestSuites) {
        issues.push({
            id: 'jest-suites-mismatch',
            severity: 'medium',
            type: 'Jest Suite Mismatch',
            filePath: 'jest',
            count: 1,
            description: `Jest suites ${summary.suitesPassed}/${summary.suitesTotal} (expected ${baseline.jestSuites} passing)`,
            recommendedAction: 'Sync jestSuites in .simplebeacon/baseline.json',
            affectedFiles: ['.simplebeacon/baseline.json'],
            metadata: summary
        });
    }

    const cachePath = path.join(baseDir, '.simplebeacon', 'jest-result.json');
    try {
        writeManagedFileSync(cachePath, `${JSON.stringify({
            generatedAt: new Date().toISOString(),
            summary,
            exitCode: result.code
        }, null, 2)}\n`, {
            force: true,
            validators: [validateJSON, validateNotEmpty],
            backupBeforeOverwrite: false
        });
    } catch {
        /* optional cache */
    }

    return {
        checked: true,
        passed: issues.length === 0,
        issues,
        summary,
        exitCode: result.code
    };
}

module.exports = {
    parseJestSummary,
    checkJestBaseline,
    runCommand
};
