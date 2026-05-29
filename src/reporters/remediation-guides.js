/**
 * Deterministic fix playbooks for audit report deliverables.
 */

const GUIDE_PLAYBOOKS = {
    credentials: {
        id: 'credentials',
        title: 'Hardcoded credential patterns',
        timeRequired: '30–60 minutes',
        difficulty: 'Moderate',
        whyItMatters: 'Secrets in git history, logs, or error output can expose infrastructure before go-live. Rotation is required if a key was ever real.',
        steps: [
            'Run `npx simplebeacon scan --format json --output .simplebeacon/report.json` and note every credential hit.',
            'Rotate exposed secrets in the provider console (AWS IAM, Stripe Dashboard, database host, etc.).',
            'Remove hardcoded strings from source and load from environment variables or a secret manager.',
            'Add `.env`, `.env.local`, and `.env.production` to `.gitignore` if not already present.',
            'Run your test suite after replacing literals with `process.env.*` reads.'
        ],
        verify: 'npx simplebeacon scan --gate'
    },
    'production-leak': {
        id: 'production-leak',
        title: 'Production code references mock or sample JSON',
        timeRequired: '45–90 minutes',
        difficulty: 'Moderate',
        whyItMatters: 'Production modules that import `-sample.json` or `/mock/` paths ship demo metrics to real users at launch.',
        steps: [
            'Open each flagged file and replace static sample imports with API calls or env-based config.',
            'Move fixtures to test-only directories (`__tests__/`, `fixtures/`) excluded from production builds.',
            'Confirm build output does not bundle sample JSON from `web/data/` or similar paths.',
            'Add a production-leak allowlist entry only for intentional seed loaders documented in code review.'
        ],
        verify: 'npx simplebeacon scan --gate --path .'
    },
    'fiction-kpi': {
        id: 'fiction-kpi',
        title: 'AI-generated fiction KPI patterns',
        timeRequired: '30–45 minutes',
        difficulty: 'Easy',
        whyItMatters: 'Placeholder completion rates and confidence scores inflate dashboards with numbers that were never measured in this repo.',
        steps: [
            'Replace template KPI literals with values from `.simplebeacon/baseline.json` or live reporting APIs.',
            'Remove metric literals from locale/copy files; bind UI labels to fetched data instead.',
            'Run `npx simplebeacon baseline sync` after a green test run to refresh measured anchors.',
            'Re-scan sample JSON under configured paths for drift vs baseline.'
        ],
        verify: 'npx simplebeacon scan --gate'
    },
    schema: {
        id: 'schema',
        title: 'Sample JSON schema drift',
        timeRequired: '20–40 minutes',
        difficulty: 'Easy',
        whyItMatters: 'Samples that miss required page-spec keys break dashboard rendering or fail validation in CI.',
        steps: [
            'Compare failing sample files against registered page specs in `.simplebeacon/config.json`.',
            'Add missing required keys or align field types with the spec definition.',
            'Remove duplicate or stale sample files flagged in the scan report.',
            'Re-run schema checks: `npx simplebeacon scan --format json`'
        ],
        verify: 'npx simplebeacon compliance --format json'
    },
    'npm-audit': {
        id: 'npm-audit',
        title: 'npm dependency vulnerabilities',
        timeRequired: '15–30 minutes',
        difficulty: 'Easy',
        whyItMatters: 'Moderate CVEs can escalate as new exploits are published; critical/high issues block safe production deploys.',
        steps: [
            'Run `npm audit` to list affected packages and severities.',
            'Apply safe fixes: `npm audit fix` (review lockfile diff before commit).',
            'For breaking upgrades, pin patched versions manually and run the full test suite.',
            'Re-run `npm audit` until critical/high (and policy moderate) counts are within your threshold.'
        ],
        verify: 'npm audit && npx simplebeacon compliance --format json'
    },
    'ci-integration': {
        id: 'ci-integration',
        title: 'Simplebeacon CI gate on pull requests',
        timeRequired: '45–60 minutes',
        difficulty: 'Moderate',
        whyItMatters: 'A PR gate stops mock leaks and credential patterns from reaching main after this audit is closed.',
        steps: [
            'Run `npx simplebeacon init` if `.simplebeacon/config.json` is not committed yet.',
            'Add `.github/workflows/simplebeacon.yml` (see `docs/GITHUB-ACTION-QUICKSTART.md`).',
            'Set gate policy in `.simplebeacon/config.json`: `"gate": { "failOn": ["high", "critical"] }`.',
            'Open a test PR and confirm the workflow fails on injected findings and passes on clean scans.',
            'Optionally install a local hook: `npx simplebeacon hook install`'
        ],
        verify: 'npx simplebeacon scan --gate'
    },
    roadmap: {
        id: 'roadmap',
        title: 'Informational roadmap template pattern',
        timeRequired: '5–10 minutes',
        difficulty: 'Easy',
        whyItMatters: 'Low-severity template markers are informational only but can confuse stakeholders if mistaken for live status.',
        steps: [
            'Confirm the flagged file is documentation-only, not loaded in production.',
            'Archive template roadmaps outside production scan paths or add an explicit ignore in config if intentional.',
            'No gate action required unless your team policy treats roadmap fiction as blocking.'
        ],
        verify: 'npx simplebeacon scan --path .'
    }
};

function issueKind(issue) {
    const type = String(issue.type || '').toLowerCase();
    if (/credential/i.test(type)) return 'credentials';
    if (/production leak/i.test(type)) return 'production-leak';
    if (/fiction|kpi|consistency/i.test(type)) return 'fiction-kpi';
    if (/schema/i.test(type)) return 'schema';
    if (/roadmap/i.test(type)) return 'roadmap';
    return 'other';
}

function collectActiveGuideIds(issues, assessment) {
    const ids = new Set();

    for (const issue of issues) {
        const kind = issueKind(issue);
        if (kind !== 'other' && GUIDE_PLAYBOOKS[kind]) {
            ids.add(kind);
        }
    }

    const failedChecks = (assessment?.complianceChecklist?.rules || [])
        .filter((rule) => rule.status === 'fail')
        .map((rule) => rule.check);

    if (failedChecks.includes('npm-no-critical-high') || failedChecks.includes('npm-moderate-limit')) {
        ids.add('npm-audit');
    }

    const gateFails = assessment?.executiveSummary?.gateResult === 'FAIL'
        || issues.some((issue) => ['critical', 'high'].includes(issue.severity));
    if (gateFails || ids.size > 0) {
        ids.add('ci-integration');
    }

    return [...ids];
}

function formatGuideSection(guide, issueCount) {
    const countNote = issueCount > 1 ? ` (${issueCount} related findings)` : '';
    const steps = guide.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');

    return `### Fix: ${guide.title}${countNote}

**Time required:** ${guide.timeRequired}  
**Difficulty:** ${guide.difficulty}

**Step-by-step:**
${steps}

**Why this matters:** ${guide.whyItMatters}

**Verify:** \`${guide.verify}\``;
}

function buildHowToFixSection(issues, assessment) {
    const guideIds = collectActiveGuideIds(issues, assessment);
    if (!guideIds.length) {
        return 'No blocking findings — maintain the current gate in CI to prevent regressions.';
    }

    const kindCounts = {};
    for (const issue of issues) {
        const kind = issueKind(issue);
        if (GUIDE_PLAYBOOKS[kind]) {
            kindCounts[kind] = (kindCounts[kind] || 0) + (issue.count || 1);
        }
    }

    const orderedIds = [
        'credentials',
        'production-leak',
        'npm-audit',
        'fiction-kpi',
        'schema',
        'roadmap',
        'ci-integration'
    ].filter((id) => guideIds.includes(id));

    const sections = orderedIds.map((id) => formatGuideSection(
        GUIDE_PLAYBOOKS[id],
        kindCounts[id] || (id === 'npm-audit' || id === 'ci-integration' ? 0 : 1)
    ));

    return sections.join('\n\n');
}

function estimateMinutes(guideId) {
    const ranges = {
        credentials: 45,
        'production-leak': 60,
        'fiction-kpi': 35,
        schema: 30,
        'npm-audit': 20,
        'ci-integration': 50,
        roadmap: 10
    };
    return ranges[guideId] || 30;
}

function buildPersonalizedActionPlan(issues, assessment) {
    const guideIds = collectActiveGuideIds(issues, assessment)
        .filter((id) => id !== 'ci-integration' && id !== 'roadmap');
    if (!guideIds.length) {
        return 'No prioritized remediation queue — scan is clean under configured paths. Schedule a quarterly re-scan before major releases.';
    }

    const week1 = [];
    const week2 = [];
    const week3 = [];

    if (guideIds.includes('credentials')) {
        week1.push({
            title: 'Remove and rotate exposed credentials',
            minutes: estimateMinutes('credentials'),
            impact: 'Clears critical security blockers and credential checklist failures'
        });
    }
    if (guideIds.includes('production-leak')) {
        week1.push({
            title: 'Replace production-path sample JSON references',
            minutes: estimateMinutes('production-leak'),
            impact: 'Prevents demo metrics from shipping at go-live'
        });
    }
    if (guideIds.includes('npm-audit')) {
        week1.push({
            title: 'Resolve npm audit vulnerabilities',
            minutes: estimateMinutes('npm-audit'),
            command: 'npm audit fix',
            impact: 'Improves supply-chain compliance score'
        });
    }

    if (guideIds.includes('fiction-kpi') || guideIds.includes('schema')) {
        week2.push({
            title: 'Align sample JSON with baseline and page specs',
            minutes: estimateMinutes('fiction-kpi') + (guideIds.includes('schema') ? estimateMinutes('schema') : 0),
            impact: 'Restores fiction KPI and schema checklist passes'
        });
    }

    week2.push({
        title: 'Integrate Simplebeacon gate into CI/CD',
        minutes: estimateMinutes('ci-integration'),
        impact: 'Blocks regressions on every pull request'
    });

    week3.push({
        title: 'Sync baseline and review allowlists',
        minutes: 30,
        command: 'npx simplebeacon baseline sync',
        impact: 'Reduces false positives and maintenance burden'
    });

    function formatWeek(label, items) {
        if (!items.length) return '';
        const lines = items.map((item, index) => {
            const cmd = item.command ? `\n   - Command: \`${item.command}\`` : '';
            return `${index + 1}. **${item.title}** (~${item.minutes} min)${cmd}\n   - Impact: ${item.impact}`;
        });
        return `### ${label}\n\n${lines.join('\n\n')}`;
    }

    const totalMinutes = [...week1, ...week2, ...week3].reduce((sum, item) => sum + item.minutes, 0);
    const hours = Math.max(1, Math.round(totalMinutes / 60));

    return `${formatWeek('Week 1: Critical path', week1)}

${formatWeek('Week 2: Prevention setup', week2)}

${formatWeek('Week 3: Optimization', week3)}

**Estimated total effort:** ~${hours} hour${hours === 1 ? '' : 's'} over 3 weeks  
**Re-verify after Week 1:** \`npx simplebeacon scan --gate\``;
}

module.exports = {
    GUIDE_PLAYBOOKS,
    issueKind,
    collectActiveGuideIds,
    buildHowToFixSection,
    buildPersonalizedActionPlan
};
