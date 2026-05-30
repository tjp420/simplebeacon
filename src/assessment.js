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
        euAiAct: [],
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
        else if (/eu ai act/i.test(type)) buckets.euAiAct.push(entry);
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
    if (buckets.euAiAct.length) parts.push(`${buckets.euAiAct.length} EU AI Act signal(s)`);
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
    const isEuAiAct = options.checklistProfile === 'eu-ai-act';
    const complianceChecklist = evaluateComplianceChecklist(report, {
        projectRoot: report.projectRoot || options.projectRoot || '',
        npmAudit: options.npmAudit,
        productionProfile: options.productionProfile,
        checklistProfile: options.checklistProfile
    });

    const assessment = {
        type: 'simplebeacon-assessment-report',
        title: isEuAiAct
            ? `Simplebeacon EU AI Act Readiness — ${options.company || options.repo || 'Repository'}`
            : `Simplebeacon Free Assessment — ${options.company || options.repo || 'Repository'}`,
        generatedAt: new Date().toISOString(),
        generatedBy: 'Simplebeacon',
        assessor: options.assessor || '',
        projectRoot: report.projectRoot || options.projectRoot || '',
        ...(isEuAiAct ? {
            assessmentProfile: 'eu-ai-act',
            deadline: '2026-08-02',
            euAiActSummary: report.euAiActSummary || null
        } : {}),
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
            ...(isEuAiAct ? {
                euAiAct: {
                    scanned: report.euAiActScanned ?? 0,
                    findings: report.euAiActFindings ?? buckets.euAiAct.length,
                    severity: 'high',
                    items: buckets.euAiAct,
                    summary: summarizeBucket(
                        buckets.euAiAct,
                        report.euAiActSummary?.highRiskIndicators
                            ? `${report.euAiActSummary.highRiskIndicators} high-risk indicator(s) — review Annex III classification`
                            : 'No EU AI Act high-risk or transparency gaps detected.'
                    )
                }
            } : {}),
            other: {
                items: buckets.other,
                summary: summarizeBucket(buckets.other, 'No other findings.')
            }
        },
        recommendedActions: {
            immediate: [
                gateResult?.pass ? null : 'Fix high-severity findings before enabling --gate on main',
                isEuAiAct && buckets.euAiAct.length ? 'Address EU AI Act transparency and documentation gaps before August 2026' : null,
                buckets.productionLeaks.length ? 'Remove hardcoded -sample.json paths from production code' : null,
                buckets.fictionKpis.length ? 'Replace fiction KPIs with repository-audit baseline values' : null,
                isEuAiAct ? 'Add docs/model-card.md and docs/risk-assessment.md for AI integrations' : null,
                'Add simplebeacon scan --gate to PR workflow (see docs/GITHUB-ACTION-QUICKSTART.md)'
            ].filter(Boolean),
            next30Days: isEuAiAct ? [
                'Conduct formal Annex III classification with legal counsel',
                'Implement human-in-the-loop review for high-risk automated decisions',
                'Wire simplebeacon compliance --checklist eu-ai-act into CI',
                'Sync .simplebeacon/baseline.json after green test runs'
            ] : [
                'Sync .simplebeacon/baseline.json after green test runs',
                'Review production-leak allowlist for intentional seed files',
                'Run consolidation scan to dedupe identical sample JSON'
            ]
        },
        complementaryStack: {
            keepUsing: isEuAiAct
                ? ['Legal counsel for formal conformity assessment', 'Snyk or GitHub Advanced Security for CVEs']
                : ['Snyk or GitHub Advanced Security for CVEs', 'SonarQube for code smells'],
            addSimplebeaconFor: isEuAiAct
                ? [
                    'Annex III high-risk pattern detection in source code',
                    'Article 50 transparency gap detection in user-facing surfaces',
                    'Documentation completeness signals before August 2026'
                ]
                : ['Mock/fiction drift in sample JSON', 'Hardcoded sample paths in production directories']
        },
        pilotProposal: {
            offer: isEuAiAct
                ? 'EU AI Act readiness audit + 30-day remediation sprint'
                : 'Wire simplebeacon gate + 30-day support',
            pricePlaceholder: isEuAiAct
                ? '$2,499–9,999 depending on AI system scope'
                : '$2,000–10,000/year depending on team size',
            ask: isEuAiAct
                ? 'Will you run simplebeacon scan --gate with --checklist eu-ai-act on every PR until August 2026?'
                : 'Will you run simplebeacon scan --gate on every PR for 2 weeks?'
        },
        ...(isEuAiAct ? {
            disclaimer: 'Static technical pattern review — not legal advice or formal conformity assessment under Regulation (EU) 2024/1689.'
        } : {}),
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
