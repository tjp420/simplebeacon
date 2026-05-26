#!/usr/bin/env node
/**
 * Simplebeacon CLI
 */

const fs = require('fs');
const path = require('path');
const {
    loadSimplebeaconConfig,
    initSimplebeacon,
    runScan,
    evaluateGate,
    formatTextReport,
    formatJsonReport,
    syncJestBaseline,
    detectProjectProfile,
    resolvePlatformRoot,
    writeManagedFileSync
} = require('../src/index');
const { formatGithubComment, postGithubComment, formatGithubStepSummary } = require('../src/reporters/github-comment');
const { buildAssessmentReport } = require('../src/assessment');
const { sanitizeReportForCloudUpload } = require('../src/lib/report-sanitizer');
const { evaluateComplianceChecklist } = require('../src/compliance-checklist');
const { installSimplebeaconHook } = require('../src/hook-install');
const { paint } = require('../src/reporters/text');
const {
    createNetworkGuard,
    printTrustBanner,
    printTrustCompletion
} = require('../src/lib/trust-guard');
const { validateJSON, validateNotEmpty } = require('../src/lib/file-validator');
const {
    SimplebeaconError,
    ConfigError
} = require('../src/lib/errors');
const {
    resolveCliProjectRoot,
    sanitizeCliPathOptions
} = require('../src/lib/path-utils');
const { sanitizePath } = require('../src/lib/path-sanitizer');

const VALID_COMMANDS = new Set(['scan', 'init', 'comment', 'baseline-sync', 'assess', 'compliance', 'hook-install']);

function writeStdoutLine(message = '') {
    process.stdout.write(`${message}\n`);
}

function parseArgs(argv) {
    const args = argv.slice(2);
    let command = args[0] || 'scan';
    let flagStart = 1;

    if (command === 'baseline' && args[1] === 'sync') {
        command = 'baseline-sync';
        flagStart = 2;
    }

    if (command === 'hook' && args[1] === 'install') {
        command = 'hook-install';
        flagStart = 2;
    }

    const options = {
        command,
        path: process.cwd(),
        config: null,
        format: 'text',
        gate: false,
        output: null,
        failOn: null,
        withJest: false,
        report: null,
        issueNumber: null,
        repo: null,
        profile: null,
        verbose: false,
        help: false,
        company: null,
        assessor: null,
        printOnly: false,
        apiToken: null,
        upload: null,
        hookType: 'pre-commit',
        preferHusky: false,
        offline: false,
        noTrustBanner: false,
        dryRun: false,
        force: false
    };

    for (let i = flagStart; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === '--path' && args[i + 1]) {
            options.path = args[++i];
        } else if (arg === '--config' && args[i + 1]) {
            options.config = args[++i];
        } else if (arg === '--format' && args[i + 1]) {
            options.format = args[++i];
        } else if (arg === '--output' && args[i + 1]) {
            options.output = args[++i];
        } else if (arg === '--report' && args[i + 1]) {
            options.report = args[++i];
        } else if (arg === '--issue-number' && args[i + 1]) {
            options.issueNumber = args[++i];
        } else if (arg === '--repo' && args[i + 1]) {
            options.repo = args[++i];
        } else if (arg === '--profile' && args[i + 1]) {
            options.profile = args[++i];
        } else if (arg === '--fail-on' && args[i + 1]) {
            options.failOn = args[++i].split(',').map((s) => s.trim()).filter(Boolean);
        } else if (arg === '--gate') {
            options.gate = true;
        } else if (arg === '--with-jest') {
            options.withJest = true;
        } else if (arg === '--verbose' || arg === '-v') {
            options.verbose = true;
        } else if (arg === '--company' && args[i + 1]) {
            options.company = args[++i];
        } else if (arg === '--assessor' && args[i + 1]) {
            options.assessor = args[++i];
        } else if (arg === '--print-only') {
            options.printOnly = true;
        } else if (arg === '--api-token' && args[i + 1]) {
            options.apiToken = args[++i];
        } else if (arg === '--upload' && args[i + 1]) {
            options.upload = args[++i];
        } else if (arg === '--type' && args[i + 1]) {
            options.hookType = args[++i];
        } else if (arg === '--husky') {
            options.preferHusky = true;
        } else if (arg === '--offline') {
            options.offline = true;
        } else if (arg === '--no-trust-banner') {
            options.noTrustBanner = true;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--force') {
            options.force = true;
        } else if (arg === '--help' || arg === '-h') {
            options.help = true;
        }
    }

    return options;
}

function applyCliPathSafety(options) {
    const sanitized = sanitizeCliPathOptions(options);
    Object.assign(options, sanitized);

    const pathRequiredCommands = new Set([
        'scan',
        'init',
        'baseline-sync',
        'assess',
        'compliance',
        'hook-install'
    ]);

    if (pathRequiredCommands.has(options.command)) {
        options.path = resolveCliProjectRoot(options.path, {
            mustExist: true,
            mustBeDirectory: true,
            label: 'Project path'
        });
    }

    return options;
}

function formatCliError(error) {
    if (error instanceof SimplebeaconError && error.code) {
        return `[${error.code}] ${error.message}`;
    }
    return error.message || String(error);
}

function printHelp() {
    writeStdoutLine(`Simplebeacon — detect mock data, fiction KPIs, and credential leaks

Usage:
  simplebeacon scan [options]     Scan project and report findings
  simplebeacon init [options]     Create .simplebeacon/config.json and baseline.json
  simplebeacon comment [options]  Post GitHub PR comment from JSON report
  simplebeacon assess [options]   Build customer assessment JSON from scan report
  simplebeacon compliance [opts]  Evaluate corporate safety checklist from report
  simplebeacon baseline sync      Run Jest and update .simplebeacon/baseline.json
  simplebeacon hook install         Install pre-commit or pre-push git hook

Init options:
  --path <dir>        Project root (default: cwd)
  --profile <name>    Force profile: minimal, standard, cascade (auto-detected by default)
  --dry-run           Preview init changes without writing files
  --force             Overwrite existing config/baseline (backup created first)

Scan options:
  --path <dir>        Project root (default: cwd)
  --config <file>     Config path (default: .simplebeacon/config.json)
  --format text|json  Output format (default: text)
  --output <file>     Write report to file
  --gate              Exit 1 when gate severities are found
  --fail-on a,b,c     Override gate fail severities (default: high)
  --with-jest         Run npm test and compare to baseline (slow)
  --verbose, -v       Print config warnings and scan paths
  --offline           Fail if any outbound network activity occurs during scan
  --no-trust-banner   Suppress read-only / local-only trust confirmation lines
  --api-token <tok>   Paid tier API token (required with --upload)
  --upload <url>      POST JSON report to Simplebeacon cloud (paid tier)

Comment options:
  --report <file>     JSON report path (default: .simplebeacon/report.json)
  --issue-number N    Pull request number (or GITHUB_EVENT_PULL_REQUEST_NUMBER)
  --repo owner/repo   Repository slug (or GITHUB_REPOSITORY)
  --print-only        Print comment markdown only (for GITHUB_STEP_SUMMARY)

Assess options:
  --path <dir>        Project root (default: cwd)
  --report <file>     Existing scan report (default: run scan first)
  --output <file>     Write assessment JSON (default: .simplebeacon/assessment.json)
  --company <name>    Customer / repo name for report title
  --assessor <name>   Your name on the deliverable

Hook install options:
  --path <dir>        Project root (default: cwd)
  --type pre-commit|pre-push   Hook to install (default: pre-commit)
  --dry-run           Preview hook install without writing files
  --fail-on a,b,c     Gate severities (default: high)
  --with-jest         Include Jest baseline in hook scan
  --husky             Prefer .husky/ even when not present yet

Profiles:
  minimal    credentials + production-leak only
  standard   all rules with generic defaults
  cascade    ai-platform dashboard preset

Examples:
  npx simplebeacon init
  npx simplebeacon init --profile minimal
  npx simplebeacon scan --gate
  npx simplebeacon scan --offline --gate
  npx simplebeacon scan --format json --output .simplebeacon/report.json --gate
  npx simplebeacon scan --format json --api-token sb_xxx --upload https://simplebeacon.ai/api/simplebeacon/cloud-scan
  npx simplebeacon assess --company "Acme" --assessor "Jane"
  npx simplebeacon compliance --format json --output .simplebeacon/compliance.json
  npx simplebeacon baseline sync
  npx simplebeacon hook install
`);
}

function printConfigWarnings(config, verbose) {
    if (!verbose || !config.configWarnings?.length) return;
    for (const warning of config.configWarnings) {
        console.error(paint(`Warning: ${warning}`, 'yellow'));
    }
}

async function uploadReportToCloud(uploadUrl, apiToken, report) {
    if (!apiToken) {
        throw new ConfigError('--api-token is required when using --upload', { uploadUrl });
    }

    const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Simplebeacon-Token': apiToken
        },
        body: JSON.stringify({ report: sanitizeReportForCloudUpload(report) })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || data.error || `Cloud upload failed (${response.status})`);
    }

    return data;
}

async function runScanCommand(options) {
    const scanRoot = options.path;
    const { platformRoot } = resolvePlatformRoot(scanRoot);
    const config = loadSimplebeaconConfig(platformRoot, options.config);
    if (options.failOn) {
        config.gate.failOn = options.failOn;
    }

    printConfigWarnings(config, options.verbose);
    if (options.verbose) {
        console.error(`Scan paths: ${config.scanPaths?.join(', ') || '(none)'}`);
        console.error(`Production paths: ${config.productionPaths?.join(', ') || '(none)'}`);
        console.error(`Profile: ${config.profile || 'standard'}`);
    }

    if (options.format !== 'text' && options.format !== 'json') {
        throw new Error(`Invalid --format "${options.format}" — use text or json`);
    }

    const networkGuard = createNetworkGuard({ offline: options.offline });
    printTrustBanner({ quiet: options.noTrustBanner, offline: options.offline }, paint);

    try {
        const sanitizedScanRoot = sanitizePath(scanRoot);
        const report = await runScan(sanitizedScanRoot, {
            config,
            configPath: options.config,
            withJest: options.withJest
        });
        networkGuard.assertOfflineClean();
        printTrustCompletion({
            quiet: options.noTrustBanner,
            offline: options.offline,
            networkEventCount: networkGuard.events.length
        }, paint);

        const gateResult = evaluateGate(report, config.gate);
        const jsonReport = formatJsonReport(report, gateResult);

        if (options.upload) {
            const uploadResult = await uploadReportToCloud(options.upload, options.apiToken, jsonReport);
            console.error(`Cloud upload complete${uploadResult.scanId ? `: ${uploadResult.scanId}` : ''}`);
        }

        const payload = options.format === 'json'
            ? JSON.stringify(jsonReport, null, 2)
            : formatTextReport(report, gateResult);

        if (options.output) {
            writeManagedFileSync(path.resolve(options.output), `${payload}\n`, {
                force: true,
                validators: options.format === 'json' ? [validateJSON, validateNotEmpty] : [validateNotEmpty]
            });
            console.error(`Report written to ${options.output}`);
        } else {
            writeStdoutLine(payload);
        }

        if (options.gate && !gateResult.pass) {
            console.error(paint(`Gate failed: ${gateResult.blockingIssues.length} blocking issue(s)`, 'red'));
            process.exit(1);
        }
    } finally {
        networkGuard.dispose();
    }
}

async function runBaselineSyncCommand(options) {
    const root = sanitizePath(options.path);
    if (options.dryRun) {
        writeStdoutLine('DRY RUN — baseline sync requires a test run; use without --dry-run to execute.');
        return;
    }
    const { summary, baselinePath, baseline } = await syncJestBaseline(root, { config: options.config });

    writeStdoutLine(`Baseline synced: ${baselinePath}`);
    writeStdoutLine(`  Jest: ${baseline.jestTestsLabel} (${summary.suitesPassed} suites)`);
}

async function runCommentCommand(options) {
    const reportPath = path.resolve(options.report || '.simplebeacon/report.json');
    if (!fs.existsSync(reportPath)) {
        throw new Error(`Report not found: ${reportPath}`);
    }

    let report;
    try {
        report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    } catch (error) {
        throw new Error(`Invalid JSON report at ${reportPath}: ${error.message}`);
    }

    const body = formatGithubComment(report, report.gate || null);

    if (options.printOnly) {
        writeStdoutLine(body);
        return;
    }

    if (!process.env.GITHUB_TOKEN) {
        writeStdoutLine(body);
        console.error('\n(dry-run — set GITHUB_TOKEN to post to GitHub)');
        return;
    }

    const result = await postGithubComment(reportPath, {
        token: process.env.GITHUB_TOKEN,
        repo: options.repo,
        issueNumber: options.issueNumber
    });

    writeStdoutLine(`Posted comment: ${result.html_url || result.url || 'ok'}`);
}

async function loadOrRunReport(options) {
    const reportPath = path.resolve(options.report || '.simplebeacon/report.json');
    if (options.report) {
        if (!fs.existsSync(reportPath)) {
            throw new Error(`Report not found: ${reportPath}`);
        }
        return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    }
    if (fs.existsSync(reportPath)) {
        return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    }

    const scanRoot = sanitizePath(options.path);
    const { platformRoot } = resolvePlatformRoot(scanRoot);
    const config = loadSimplebeaconConfig(platformRoot, options.config);
    const report = await runScan(scanRoot, { config, configPath: options.config });
    const gateResult = evaluateGate(report, config.gate);
    return formatJsonReport(report, gateResult);
}

async function runAssessCommand(options) {
    const root = sanitizePath(options.path);
    const report = await loadOrRunReport(options);
    const assessment = buildAssessmentReport(report, {
        company: options.company || path.basename(root),
        assessor: options.assessor || '',
        projectRoot: report.projectRoot || root,
        commandsRun: [
            'npx simplebeacon scan --format json --output .simplebeacon/report.json --gate',
            `npx simplebeacon assess --company "${options.company || path.basename(root)}"${options.assessor ? ` --assessor "${options.assessor}"` : ''}`
        ]
    });

    const outputPath = path.resolve(options.output || '.simplebeacon/assessment.json');
    writeManagedFileSync(outputPath, `${JSON.stringify(assessment, null, 2)}\n`, {
        force: true,
        validators: [validateJSON, validateNotEmpty]
    });

    writeStdoutLine(`Assessment written to ${outputPath}`);
    writeStdoutLine(`Gate: ${assessment.executiveSummary.gateResult}`);
    writeStdoutLine(`Compliance: ${assessment.complianceChecklist.summary.passed}/${assessment.complianceChecklist.summary.passed + assessment.complianceChecklist.summary.failed} rules pass (score ${assessment.executiveSummary.complianceScore ?? '—'})`);
    writeStdoutLine(`Headline: ${assessment.executiveSummary.headline}`);
}

async function runComplianceCommand(options) {
    const root = sanitizePath(options.path);
    const report = await loadOrRunReport(options);
    const checklist = evaluateComplianceChecklist(report, { projectRoot: report.projectRoot || root });
    const outputPath = path.resolve(options.output || '.simplebeacon/compliance-result.json');

    if (options.format === 'json' || options.output) {
        writeManagedFileSync(outputPath, `${JSON.stringify(checklist, null, 2)}\n`, {
            force: true,
            validators: [validateJSON, validateNotEmpty]
        });
        writeStdoutLine(`Compliance checklist written to ${outputPath}`);
    }

    writeStdoutLine(`${checklist.summary.headline}`);
    for (const rule of checklist.rules) {
        const icon = rule.status === 'pass' ? '✓' : rule.status === 'fail' ? '✗' : '○';
        writeStdoutLine(`  ${icon} ${rule.id} ${rule.title} — ${rule.evidence}`);
    }

    if (options.gate && checklist.summary.failed > 0) {
        process.exit(1);
    }
}

function runInitCommand(options) {
    const root = sanitizePath(options.path);
    const created = initSimplebeacon(root, {
        profile: options.profile,
        dryRun: options.dryRun,
        force: options.force
    });
    const detected = created.detected || detectProjectProfile(root);

    if (created.dryRun) {
        writeStdoutLine('DRY RUN — no files were modified');
        writeStdoutLine('');
        for (const action of created.plannedActions || []) {
            writeStdoutLine(`Would ${action.action}: ${action.path}`);
        }
        writeStdoutLine('');
        writeStdoutLine(`Profile: ${created.profile}`);
        return;
    }

    if (created.configCreated) {
        writeStdoutLine(`Created ${created.configPath}`);
    } else {
        writeStdoutLine(`Skipped existing ${created.configPath}`);
    }
    if (created.baselineCreated) {
        writeStdoutLine(`Created ${created.baselinePath}`);
    } else {
        writeStdoutLine(`Skipped existing ${created.baselinePath}`);
    }

    writeStdoutLine('');
    writeStdoutLine(`Profile: ${created.profile}`);
    writeStdoutLine(`Detected package manager: ${detected.packageManager}`);
    writeStdoutLine(`Scan paths: ${detected.scanPaths.join(', ')}`);
    writeStdoutLine(`Production paths: ${detected.productionPaths.join(', ')}`);
    writeStdoutLine('');
    writeStdoutLine('Next steps:');
    writeStdoutLine('  npx simplebeacon scan');
    writeStdoutLine('  npx simplebeacon scan --gate');
    writeStdoutLine('  npx simplebeacon hook install');
    writeStdoutLine('  npx simplebeacon baseline sync   # after a green test run');
}

function runHookInstallCommand(options) {
    const result = installSimplebeaconHook(sanitizePath(options.path), {
        type: options.hookType,
        failOn: options.failOn || 'high',
        withJest: options.withJest,
        preferHusky: options.preferHusky,
        dryRun: options.dryRun
    });

    if (result.dryRun) {
        writeStdoutLine('DRY RUN — no files were modified');
        writeStdoutLine('');
        for (const action of result.plannedActions || []) {
            writeStdoutLine(`Would ${action.action}: ${action.path}`);
        }
        writeStdoutLine(`Hook type: ${result.type} (${result.kind})`);
        return;
    }

    writeStdoutLine(`Installed ${result.type} hook (${result.kind}): ${result.hookPath}`);
    if (result.manual) {
        writeStdoutLine('');
        writeStdoutLine('Not a Git repo — copy the script into .husky/ or .git/hooks/ and chmod +x.');
    } else if (result.kind === 'husky') {
        writeStdoutLine('Ensure Husky is enabled: npm install -D husky && npx husky init');
    }
}

async function main() {
    const options = parseArgs(process.argv);

    if (options.help) {
        printHelp();
        process.exit(0);
    }

    if (!VALID_COMMANDS.has(options.command)) {
        console.error(`Unknown command: ${options.command}`);
        printHelp();
        process.exit(2);
    }

    applyCliPathSafety(options);

    if (options.command === 'init') {
        runInitCommand(options);
        return;
    }

    if (options.command === 'comment') {
        await runCommentCommand(options);
        return;
    }

    if (options.command === 'baseline-sync') {
        await runBaselineSyncCommand(options);
        return;
    }

    if (options.command === 'assess') {
        await runAssessCommand(options);
        return;
    }

    if (options.command === 'compliance') {
        await runComplianceCommand(options);
        return;
    }

    if (options.command === 'hook-install') {
        runHookInstallCommand(options);
        return;
    }

    if (options.command === 'scan') {
        await runScanCommand(options);
        return;
    }
}

main().catch((error) => {
    console.error(paint(formatCliError(error), 'red'));
    process.exit(2);
});
