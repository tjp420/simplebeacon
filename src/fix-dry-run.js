/**
 * Structured remediation dry-run — emits fixSpec objects without modifying source.
 */

const fs = require('fs');
const path = require('path');
const { resolvePlatformRoot } = require('./project-detect');

function loadRemediationModule(platformRoot) {
    const modulePath = path.join(platformRoot, 'server', 'lib', 'audit-remediation-recipes.js');
    if (!fs.existsSync(modulePath)) {
        throw new Error(
            'Structured fix specs require the Simplebeacon platform (server/lib/audit-remediation-recipes.js). '
            + 'Run from a repo that includes ai-platform.'
        );
    }
    return require(modulePath);
}

function loadScanPayload(reportPath, platformRoot) {
    const candidates = [
        reportPath,
        path.join(platformRoot, '.simplebeacon', 'report.json'),
        path.join(platformRoot, '.simplebeacon', 'archive', 'complete-scan-latest.json')
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) {
            return {
                payload: JSON.parse(fs.readFileSync(candidate, 'utf8')),
                sourcePath: candidate
            };
        }
    }

    return { payload: null, sourcePath: null };
}

function runFixDryRun(options = {}) {
    const { platformRoot } = resolvePlatformRoot(options.path);
    const {
        buildFixPlanFromScan,
        buildVerificationCommand
    } = loadRemediationModule(platformRoot);

    let scanPayload = options.scanPayload || null;
    let sourcePath = options.reportPath || null;

    if (!scanPayload) {
        const loaded = loadScanPayload(options.reportPath, platformRoot);
        scanPayload = loaded.payload;
        sourcePath = loaded.sourcePath;
    }

    if (!scanPayload) {
        throw new Error(
            'No scan report found. Run `npx simplebeacon scan --gate --format json --output .simplebeacon/report.json` '
            + 'or pass `--report path/to/scan.json`.'
        );
    }

    const plan = buildFixPlanFromScan(scanPayload, {
        dryRun: true,
        projectPath: scanPayload.projectRoot || options.path,
        platformRoot
    });

    return {
        ...plan,
        reportSource: sourcePath,
        verify: buildVerificationCommand(options.path, { platformRoot })
    };
}

function formatFixDryRunText(plan) {
    const lines = [
        'Simplebeacon fix dry-run — no files modified',
        `Report source: ${plan.reportSource || 'inline payload'}`,
        `Gate pass: ${plan.gatePass === null ? 'unknown' : plan.gatePass ? 'yes' : 'no'}`,
        `Fixes: ${plan.fixCount}`,
        ''
    ];

    if (!plan.fixCount) {
        lines.push('No structured fixes — scan is clean under configured paths.');
        lines.push(`Verify: ${plan.verify}`);
        return lines.join('\n');
    }

    if (plan.summary) {
        lines.push(
            `Gate-blocking: ${plan.summary.gateBlockingCount} · Hygiene: ${plan.summary.hygieneCount} · Est. ${plan.summary.estimatedTotalMinutes} min`
        );
        lines.push('');
    }

    for (const [index, fix] of plan.fixes.entries()) {
        lines.push(`${index + 1}. [${String(fix.severity || 'medium').toUpperCase()}] ${fix.location}`);
        lines.push(`   Kind: ${fix.kind} · ${fix.blocksGate ? 'Blocks gate' : 'Non-blocking'} · ~${fix.estimatedMinutes || '?'} min`);
        lines.push(`   Impact: ${fix.businessImpact || '—'}`);
        if (fix.recipe) {
            lines.push(`   Recipe:\n${fix.recipe.split('\n').map((line) => `     ${line}`).join('\n')}`);
        }
        lines.push('');
    }

    lines.push(`Verify: ${plan.verify}`);
    return lines.join('\n');
}

module.exports = {
    runFixDryRun,
    formatFixDryRunText,
    loadRemediationModule
};
