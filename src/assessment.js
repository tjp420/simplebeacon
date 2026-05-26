/**
 * Build customer-facing assessment JSON from a simplebeacon scan report.
 */

const { evaluateComplianceChecklist } = require('./compliance-checklist');
const { sanitizeAssessment } = require('./lib/report-sanitizer');

function bucketIssues(rawIssues = []) {
    const buckets = {
        credentials: [],
        fictionKpis: [],
        productionLeaks: [],
        schemaDrift: [],
        other: []
    };

    for (const issue of rawIssues) {
        const type = String(issue.type || '').toLowerCase();
        const entry = {
            file: issue.filePath || issue.affectedFiles?.[0] || '—',
            description: issue.description,
            severity: issue.severity,
            count: issue.count || 1,
            recommendedAction: issue.recommendedAction
        };

        if (/credential/i.test(type)) buckets.credentials.push(entry);
        else if (/fiction|consistency|kpi|jest count/i.test(type)) buckets.fictionKpis.push(entry);
        else if (/production leak/i.test(type)) buckets.productionLeaks.push(entry);
        else if (/schema/i.test(type)) buckets.schemaDrift.push(entry);
        else buckets.other.push(entry);
    }

    return buckets;
}

function summarizeBucket(items, emptyText) {
    if (!items.length) return emptyText;
    return items.slice(0, 5).map((i) => `${i.file}: ${i.description}`).join('; ');
}

function buildHeadline(report, gateResult, buckets) {
    const high = report.severityCounts?.high || 0;
    const medium = report.severityCounts?.medium || 0;
    const prodLeaks = report.productionLeakFindings ?? buckets.productionLeaks.length;
    const parts = [];
    if (buckets.fictionKpis.length) parts.push(`${buckets.fictionKpis.length} fiction/KPI issue(s)`);
    if (prodLeaks) parts.push(`${prodLeaks} production-path leak(s)`);
    if (buckets.credentials.length) parts.push(`${buckets.credentials.length} credential pattern(s)`);
    if (buckets.schemaDrift.length) parts.push(`${buckets.schemaDrift.length} schema issue(s)`);

    if (!parts.length) {
        return gateResult?.pass
            ? 'Clean scan — no blocking mock/fiction findings in configured paths.'
            : 'Gate failed but no categorized high-severity fiction/mock findings — review raw report.';
    }

    const gateNote = gateResult?.pass
        ? (medium > 0 && high === 0
            ? 'Gate passes — MEDIUM findings are warnings under current failOn policy.'
            : 'Gate would pass on current severities.')
        : 'Gate would fail — these issues block merge when --gate is enabled.';

    return `${parts.join('; ')}. ${gateNote}`;
}

function buildAssessmentReport(report, options = {}) {
    const gateResult = report.gate || options.gateResult || null;
    const buckets = bucketIssues(report.rawIssues || []);
    const sev = report.severityCounts || { high: 0, medium: 0, low: 0 };
    const complianceChecklist = evaluateComplianceChecklist(report, {
        projectRoot: report.projectRoot || options.projectRoot || '',
        npmAudit: options.npmAudit,
        productionProfile: options.productionProfile
    });

    const assessment = {
        type: 'simplebeacon-assessment-report',
        title: `Simplebeacon Free Assessment — ${options.company || options.repo || 'Repository'}`,
        generatedAt: new Date().toISOString(),
        generatedBy: 'Simplebeacon',
        assessor: options.assessor || '',
        projectRoot: report.projectRoot || options.projectRoot || '',
        executiveSummary: {
            gateResult: gateResult?.pass ? 'PASS' : 'FAIL',
            qualityScore: report.qualityScore ?? null,
            filesScanned: report.totalFiles ?? 0,
            criticalIssues: sev.critical || 0,
            highIssues: sev.high || 0,
            mediumIssues: sev.medium || 0,
            lowIssues: sev.low || 0,
            headline: buildHeadline(report, gateResult, buckets),
            complianceScore: complianceChecklist.summary.score,
            complianceReady: complianceChecklist.summary.readyForAutomation
        },
        complianceChecklist,
        findings: {
            credentials: {
                scanned: report.credentialScanned ?? 0,
                findings: report.credentialFindings ?? buckets.credentials.length,
                severity: 'high',
                items: buckets.credentials,
                summary: summarizeBucket(buckets.credentials, 'No credential patterns detected in scanned paths.')
            },
            fictionKpis: {
                scanned: report.consistencyChecked ?? 0,
                findings: buckets.fictionKpis.length,
                severity: 'high',
                items: buckets.fictionKpis,
                summary: summarizeBucket(buckets.fictionKpis, 'No fiction KPI or consistency drift detected.')
            },
            productionLeaks: {
                scanned: report.productionLeakScanned ?? 0,
                findings: report.productionLeakFindings ?? buckets.productionLeaks.length,
                severity: 'medium',
                items: buckets.productionLeaks,
                summary: summarizeBucket(buckets.productionLeaks, 'No mock/sample path references in production directories.')
            },
            schemaDrift: {
                checked: report.schemaChecked ?? 0,
                passed: report.schemaPassed ?? 0,
                severity: 'high',
                items: buckets.schemaDrift,
                summary: summarizeBucket(buckets.schemaDrift, 'All registered page samples match schema specs.')
            },
            other: {
                items: buckets.other,
                summary: summarizeBucket(buckets.other, 'No other findings.')
            }
        },
        recommendedActions: {
            immediate: [
                gateResult?.pass ? null : 'Fix high-severity findings before enabling --gate on main',
                buckets.productionLeaks.length ? 'Remove hardcoded -sample.json paths from production code' : null,
                buckets.fictionKpis.length ? 'Replace fiction KPIs with repository-audit baseline values' : null,
                'Add simplebeacon scan --gate to PR workflow (see docs/GITHUB-ACTION-QUICKSTART.md)'
            ].filter(Boolean),
            next30Days: [
                'Sync .simplebeacon/baseline.json after green test runs',
                'Review production-leak allowlist for intentional seed files',
                'Run consolidation scan to dedupe identical sample JSON'
            ]
        },
        complementaryStack: {
            keepUsing: ['Snyk or GitHub Advanced Security for CVEs', 'SonarQube for code smells'],
            addSimplebeaconFor: ['Mock/fiction drift in sample JSON', 'Hardcoded sample paths in production directories']
        },
        pilotProposal: {
            offer: 'Wire simplebeacon gate + 30-day support',
            pricePlaceholder: '$2,000–10,000/year depending on team size',
            ask: 'Will you run simplebeacon scan --gate on every PR for 2 weeks?'
        },
        commandsRun: options.commandsRun || [
            'npx simplebeacon scan --format json --output .simplebeacon/report.json',
            'npx simplebeacon scan --gate',
            'npx simplebeacon assess --report .simplebeacon/report.json'
        ],
        sourceReport: {
            generatedAt: report.generatedAt,
            scanPaths: report.scanPaths,
            duplicateGroups: report.duplicateGroups ?? 0
        }
    };

    return sanitizeAssessment(assessment);
}

module.exports = {
    bucketIssues,
    buildAssessmentReport
};
