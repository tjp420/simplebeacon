/**
 * GitHub pull-request comment formatter for simplebeacon reports.
 */

function formatGithubComment(report, gateResult = null) {
    const counts = report.severityCounts || { critical: 0, high: 0, medium: 0, low: 0 };
    const gate = gateResult || report.gate || null;
    const gateLine = gate
        ? (gate.pass ? '✅ **Gate: PASS**' : '❌ **Gate: FAIL**')
        : null;

    const lines = [
        '## Simplebeacon',
        '',
        gateLine,
        gate?.failOn?.length ? `_Fails on: ${gate.failOn.join(', ')}_` : null,
        '',
        '| Severity | Count |',
        '|----------|-------|',
        `| 🚨 Critical | ${counts.critical || 0} |`,
        `| 🔴 High | ${counts.high || 0} |`,
        `| 🟡 Medium | ${counts.medium || 0} |`,
        `| 🟢 Low | ${counts.low || 0} |`,
        '',
        `- **Files scanned:** ${report.totalFiles ?? 0}`,
        `- **Quality score:** ${report.qualityScore ?? '—'}/100`,
        `- **Schema compliance:** ${report.schemaCompliance ?? '—'}%`,
        `- **Duplicate groups:** ${report.duplicateGroups ?? 0}`
    ].filter(Boolean);

    if (report.scanPaths?.length) {
        lines.push('', '**Scan paths:**', ...report.scanPaths.map((p) => `- \`${p}\``));
    }

    const blocking = gate?.blockingIssues
        || report.rawIssues?.filter((i) => i.severity === 'high') || [];
    if (blocking.length) {
        lines.push('', '### Blocking issues');
        for (const issue of blocking.slice(0, 10)) {
            const file = issue.filePath ? ` (\`${issue.filePath.split(/[/\\]/).pop()}\`)` : '';
            lines.push(`- **${issue.type}**${file} — ${issue.description}`);
        }
        if (blocking.length > 10) {
            lines.push(`- …and ${blocking.length - 10} more`);
        }
        lines.push('', '**Suggested fixes:** fiction KPIs → baseline values; production leaks → API/scanner; credentials → rotate + env vars.');
    } else {
        lines.push('', 'No blocking issues detected.');
    }

    lines.push(
        '',
        '---',
        '*Complements Snyk/GHAS (CVEs) — gates mock/fiction sample drift. Configure via `.simplebeacon/config.json`.*'
    );

    return lines.join('\n');
}

function formatGithubStepSummary(report, gateResult = null) {
    const gate = gateResult || report.gate || null;
    const counts = report.severityCounts || { critical: 0, high: 0, medium: 0, low: 0 };
    return [
        '## Simplebeacon',
        '',
        gate ? (gate.pass ? '✅ Gate **PASS**' : '❌ Gate **FAIL**') : 'Gate not evaluated',
        '',
        `- Critical: ${counts.critical || 0} · High: ${counts.high || 0} · Medium: ${counts.medium || 0} · Low: ${counts.low || 0}`,
        `- Files: ${report.totalFiles ?? 0} · Quality: ${report.qualityScore ?? '—'}%`,
        ''
    ].join('\n');
}

async function postGithubComment(reportPath, options = {}) {
    const token = options.token || process.env.GITHUB_TOKEN;
    const repo = options.repo || process.env.GITHUB_REPOSITORY;
    const issueNumber = options.issueNumber || process.env.GITHUB_EVENT_PULL_REQUEST_NUMBER
        || process.env.GITHUB_PR_NUMBER;

    if (!token) throw new Error('GITHUB_TOKEN is required to post PR comments');
    if (!repo) throw new Error('GITHUB_REPOSITORY is required to post PR comments');
    if (!issueNumber) throw new Error('Pull request number is required (GITHUB_EVENT_PULL_REQUEST_NUMBER)');

    const fs = require('fs');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const body = formatGithubComment(report, report.gate || null);

    const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'simplebeacon'
        },
        body: JSON.stringify({ body })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`GitHub API ${response.status}: ${text}`);
    }

    return response.json();
}

module.exports = {
    formatGithubComment,
    formatGithubStepSummary,
    postGithubComment
};
