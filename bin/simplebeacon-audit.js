#!/usr/bin/env node
/**
 * Slop Audit — zero-signup local lead magnet + GitHub Actions PR gate.
 *
 * Usage:
 *   npx simplebeacon-audit
 *   npx simplebeacon-audit --path=./src
 *   npx simplebeacon-audit --path=. --fail-on-slop --ci-ledger
 */

const fs = require('fs');
const path = require('path');
const {
  loadSimplebeaconConfig,
  runScan,
  evaluateGate,
  formatTextReport,
  formatJsonReport,
  writeManagedFileSync
} = require('../src/index');
const { paint } = require('../src/reporters/text');
const { liabilityMetrics } = require('../src/lib/liability-metrics');
const { createNetworkGuard, printTrustBanner, printTrustCompletion } = require('../src/lib/trust-guard');
const { validateJSON, validateNotEmpty } = require('../src/lib/file-validator');
const { buildAssessmentReport } = require('../src/assessment');
const { sanitizePath } = require('../src/lib/path-sanitizer');
const {
  resolveAppBaseUrl,
  uploadComplianceLedgerReport
} = require('../src/lib/cloud-upload');

function isGitHubCi() {
  return String(process.env.GITHUB_ACTIONS || '').toLowerCase() === 'true';
}

function resolveDefaultScanPath(explicitPath) {
  if (explicitPath) return explicitPath;
  if (isGitHubCi()) return '.';
  const candidates = ['./src', './server', './packages', '.'];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // try next
    }
  }
  return '.';
}

function parseArgs(argv) {
  const options = {
    path: null,
    positionalPath: null,
    company: null,
    assessor: null,
    checklist: null,
    withAssess: false,
    failOnSlop: false,
    ciLedger: false,
    noUpsell: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--with-assess') {
      options.withAssess = true;
    } else if (arg === '--fail-on-slop' || arg === '--fail-on-slop=true') {
      options.failOnSlop = true;
    } else if (arg === '--ci-ledger' || arg === '--ci-ledger=true') {
      options.ciLedger = true;
    } else if (arg === '--no-upsell') {
      options.noUpsell = true;
    } else if (arg === '--path' && argv[i + 1]) {
      options.path = argv[++i];
    } else if (arg.startsWith('--path=')) {
      options.path = arg.slice('--path='.length);
    } else if (arg === '--company' && argv[i + 1]) {
      options.company = argv[++i];
    } else if (arg === '--assessor' && argv[i + 1]) {
      options.assessor = argv[++i];
    } else if (arg === '--checklist' && argv[i + 1]) {
      options.checklist = argv[++i];
    } else if (!arg.startsWith('-') && !options.positionalPath) {
      options.positionalPath = arg;
    }
  }

  options.path = resolveDefaultScanPath(options.path || options.positionalPath);
  if (isGitHubCi() && !argv.some((a) => a.startsWith('--fail-on-slop'))) {
    options.failOnSlop = true;
  }
  return options;
}

function printHelp() {
  process.stdout.write(`${paint('SimpleBeacon Slop Audit', 'cyan')} — local smoke detector + CI PR gate\n\n`);
  process.stdout.write('  npx simplebeacon-audit [path]\n');
  process.stdout.write('  npx simplebeacon-audit --path=.\n');
  process.stdout.write('  npx simplebeacon-audit --fail-on-slop --ci-ledger\n\n');
  process.stdout.write('Flags:\n');
  process.stdout.write('  --fail-on-slop     Exit 1 when AI slop / gate violations found (default in GitHub Actions)\n');
  process.stdout.write('  --ci-ledger        POST report to compliance ledger when SIMPLEBEACON_TOKEN is set\n');
  process.stdout.write('  --with-assess      Also write .simplebeacon/assessment.json\n');
}

function printCiHeader(scanPath) {
  const repo = process.env.GITHUB_REPOSITORY || 'local/workspace';
  const ref = process.env.GITHUB_REF_NAME || 'unknown';
  const pr = process.env.PR_NUMBER || process.env.GITHUB_EVENT_PULL_REQUEST_NUMBER;
  process.stdout.write(`\n${paint('[SimpleBeacon CI] Corporate Liability Firewall', 'cyan')}\n`);
  process.stdout.write(`Repository: ${repo} · branch: ${ref}${pr ? ` · PR #${pr}` : ''}\n`);
  process.stdout.write(`Scan root: ${scanPath}\n\n`);
}

function printCiFirewallFooter(metrics, gateResult) {
  const appUrl = resolveAppBaseUrl(process.env.SIMPLEBEACON_APP_URL);
  const violations = metrics.unauditedArtifacts;
  const blocked = !gateResult.pass || violations > 0;

  process.stdout.write('\n');
  process.stdout.write(paint('=== FORENSIC REPOSITORY ANALYSIS SUMMARY ===', 'cyan'));
  process.stdout.write('\n');
  process.stdout.write(`Compliance risk violations found: ${violations}\n`);
  process.stdout.write(`Merge gate blocking issues: ${metrics.blockingCount}\n\n`);

  if (blocked) {
    process.stdout.write(paint('FIREWALL ACTION REQUIRED', 'red'));
    process.stdout.write('\n');
    process.stdout.write('Un-audited AI anomalies are attempting to leak into your production stack.\n');
    process.stdout.write('Append an immutable ledger block and export human-oversight documentation:\n\n');
    process.stdout.write(paint(`  ${appUrl}/#/pricing`, 'cyan'));
    process.stdout.write('\n');
    process.stdout.write(`Compliance trail dashboard: ${appUrl}/app#/compliance-trail\n`);
    process.stdout.write('Set repository secrets SIMPLEBEACON_TOKEN + SIMPLEBEACON_API_URL to record CI events.\n\n');
    return;
  }

  process.stdout.write(paint('[✓] Repository evaluation clean under current hygiene rules.', 'green'));
  process.stdout.write('\n\n');
}

async function maybePushCiLedger(report, gateResult, scanRoot, options) {
  if (!options.ciLedger && !isGitHubCi()) return null;

  const token = process.env.SIMPLEBEACON_TOKEN || process.env.SIMPLEBEACON_API_KEY;
  if (!token) {
    if (options.ciLedger) {
      process.stdout.write(`${paint('CI ledger skipped', 'yellow')} — set SIMPLEBEACON_TOKEN secret to record events.\n`);
    }
    return null;
  }

  const jsonReport = formatJsonReport(report, gateResult);
  const baseUrl = resolveAppBaseUrl(process.env.SIMPLEBEACON_API_URL);
  const result = await uploadComplianceLedgerReport({
    baseUrl,
    token,
    report: jsonReport,
    cwd: scanRoot,
    repository: process.env.GITHUB_REPOSITORY,
    branch: process.env.GITHUB_REF_NAME,
    actorLogin: 'github-actions[bot]',
    sha: process.env.GITHUB_SHA
  });

  process.stdout.write(paint('Compliance ledger ingress complete', 'green'));
  process.stdout.write(` — event ${result.event_id}\n`);
  return result;
}

function resolveExitCode(metrics, gateResult, options) {
  if (options.failOnSlop) {
    if (metrics.unauditedArtifacts > 0 || !gateResult.pass) {
      return 1;
    }
  } else if (!gateResult.pass) {
    return 1;
  }
  return 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const scanRoot = path.resolve(options.path);
  const inCi = isGitHubCi();

  if (inCi) {
    printCiHeader(options.path);
  } else {
    process.stdout.write(`\n${paint('[SimpleBeacon] Slop Audit', 'cyan')} — scanning ${options.path} for un-audited AI artifacts…\n`);
    process.stdout.write(`${paint('Local only', 'dim')} — source never leaves your machine unless you run upload.\n\n`);
  }

  const networkGuard = createNetworkGuard({ offline: !options.ciLedger });
  if (!inCi) {
    printTrustBanner({ offline: true }, paint);
  }

  try {
    const config = loadSimplebeaconConfig(scanRoot, null);
    const report = await runScan(sanitizePath(scanRoot), { config });
    if (!options.ciLedger) {
      networkGuard.assertOfflineClean();
    }
    if (!inCi) {
      printTrustCompletion({ offline: true, networkEventCount: networkGuard.events.length }, paint);
    }

    const gateResult = evaluateGate(report, config.gate);
    const metrics = liabilityMetrics(report, gateResult);
    const jsonReport = formatJsonReport(report, gateResult);
    const reportDir = path.join(scanRoot, '.simplebeacon');
    const reportPath = path.join(reportDir, 'report.json');
    writeManagedFileSync(reportPath, `${JSON.stringify(jsonReport, null, 2)}\n`, {
      force: true,
      validators: [validateJSON, validateNotEmpty]
    });

    if (inCi) {
      process.stdout.write(`${formatTextReport(report, gateResult, { noUpsell: true })}\n`);
      printCiFirewallFooter(metrics, gateResult);
    } else {
      process.stdout.write(`${formatTextReport(report, gateResult, { noUpsell: options.noUpsell })}\n`);
    }

    if (options.withAssess) {
      const assessment = buildAssessmentReport(jsonReport, {
        company: options.company || path.basename(scanRoot),
        assessor: options.assessor || 'SimpleBeacon Slop Audit',
        checklistProfile: options.checklist || 'default'
      });
      const assessmentPath = path.join(reportDir, 'assessment.json');
      fs.mkdirSync(reportDir, { recursive: true });
      fs.writeFileSync(assessmentPath, `${JSON.stringify(assessment, null, 2)}\n`, 'utf8');
      process.stdout.write(`\nAssessment written to ${assessmentPath}\n`);
    }

    await maybePushCiLedger(report, gateResult, scanRoot, options);

    const exitCode = resolveExitCode(metrics, gateResult, options);
    if (exitCode !== 0 && !inCi) {
      process.stdout.write(`\n${paint('Gate would block CI', 'yellow')} — https://simplebeacon.ai/book\n`);
    }
    process.exit(exitCode);
  } finally {
    networkGuard.dispose();
  }
}

main().catch((error) => {
  process.stderr.write(`${paint(error.message, 'red')}\n`);
  process.exit(2);
});
