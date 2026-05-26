/**
 * Evaluate declarative corporate safety rules against a Simplebeacon scan report.
 */

const fs = require('fs');
const path = require('path');
const DEFAULT_CHECKLIST = require('./compliance-checklist.defaults.json');

function isEvaluatedChecklistOutput(custom) {
    const customRules = Array.isArray(custom?.rules) ? custom.rules : [];
    if (!customRules.length) return false;
    if (custom.evaluatedAt || custom.summary?.passed != null || custom.summary?.failed != null) {
        return true;
    }
    return customRules.every((rule) => rule.status != null && !rule.check);
}

function mergeChecklistRules(customRules, defaultRules) {
    const defaultsById = new Map((defaultRules || []).map((rule) => [rule.id, rule]));
    if (!customRules?.length) return defaultRules;

    return customRules.map((rule) => {
        const base = defaultsById.get(rule.id) || {};
        const merged = {
            ...base,
            ...rule,
            check: rule.check || base.check
        };
        delete merged.status;
        delete merged.evidence;
        return merged;
    }).filter((rule) => rule.check);
}

function loadComplianceChecklist(projectRoot) {
    if (!projectRoot) return DEFAULT_CHECKLIST;
    const customPath = path.join(path.resolve(projectRoot), '.simplebeacon', 'compliance-checklist.json');
    if (!fs.existsSync(customPath)) return DEFAULT_CHECKLIST;
    try {
        const custom = JSON.parse(fs.readFileSync(customPath, 'utf8'));
        const defaultRules = DEFAULT_CHECKLIST.rules || [];
        const customRules = Array.isArray(custom.rules) ? custom.rules : [];
        const rules = isEvaluatedChecklistOutput(custom)
            ? defaultRules
            : mergeChecklistRules(customRules, defaultRules);
        return {
            ...DEFAULT_CHECKLIST,
            ...custom,
            rules: rules.length ? rules : defaultRules
        };
    } catch {
        return DEFAULT_CHECKLIST;
    }
}

function readJsonSafe(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function detectNpmAuditSummary(projectRoot) {
    if (!projectRoot) return null;
    const root = path.resolve(projectRoot);
    const pkgPath = path.join(root, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    const lock = readJsonSafe(path.join(root, 'package-lock.json'));
    const pkg = readJsonSafe(pkgPath);
    const naturalVer = lock?.packages?.['node_modules/natural']?.version
        || String(pkg?.dependencies?.natural || '').replace(/^[\^~>=<]+/, '');
    const naturalMajor = parseInt(String(naturalVer).split('.')[0], 10);

    return {
        source: 'lockfile-heuristic',
        summary: {
            critical: 0,
            high: 0,
            moderate: Number.isFinite(naturalMajor) && naturalMajor >= 8 ? 0 : 1,
            low: 0,
            info: 0,
            total: Number.isFinite(naturalMajor) && naturalMajor >= 8 ? 0 : 1
        },
        note: Number.isFinite(naturalMajor) && naturalMajor >= 8
            ? 'Lockfile heuristic clean (natural≥8) — run npm audit on CI for full CVE coverage'
            : 'Run npm audit for full dependency posture'
    };
}

function detectProductionAuthProfile(projectRoot) {
    if (!projectRoot) return null;
    const envPath = path.join(path.resolve(projectRoot), '.env.production');
    if (!fs.existsSync(envPath)) {
        return { configured: false, requireAuth: false, reason: '.env.production not present' };
    }

    const text = fs.readFileSync(envPath, 'utf8');
    const parseEnvMap = (envText) => {
        const map = {};
        for (const rawLine of String(envText).split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const idx = line.indexOf('=');
            if (idx <= 0) continue;
            const key = line.slice(0, idx).trim();
            let value = line.slice(idx + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
                value = value.slice(1, -1);
            }
            map[key] = value;
        }
        return map;
    };
    const isPlaceholderSecret = (value) => {
        const normalized = String(value || '').trim();
        if (!normalized) return true;
        return /^(REPLACE_ON_HOST|changeme|your-secret|replace-me|example|placeholder)/i.test(normalized);
    };

    const env = parseEnvMap(text);
    const requireAuth = String(env.REQUIRE_AUTH || '').toLowerCase() === 'true';
    const jwtSecretSet = !isPlaceholderSecret(env.JWT_SECRET);
    const hasRefreshSecret = Object.prototype.hasOwnProperty.call(env, 'JWT_REFRESH_SECRET');
    const jwtRefreshSecretSet = hasRefreshSecret ? !isPlaceholderSecret(env.JWT_REFRESH_SECRET) : true;
    const jwtSet = jwtSecretSet && jwtRefreshSecretSet;

    return {
        configured: requireAuth && jwtSet,
        requireAuth,
        jwtConfigured: jwtSet,
        jwtSecretConfigured: jwtSecretSet,
        jwtRefreshConfigured: jwtRefreshSecretSet,
        reason: requireAuth && jwtSet
            ? 'REQUIRE_AUTH=true with non-placeholder JWT'
            : !requireAuth
                ? 'Set REQUIRE_AUTH=true in .env.production'
                : !jwtSecretSet
                    ? 'Set a non-placeholder JWT_SECRET in .env.production'
                    : 'Set a non-placeholder JWT_REFRESH_SECRET in .env.production'
    };
}

function buildEvaluationContext(report, options = {}) {
    const projectRoot = options.projectRoot || report.projectRoot || '';
    return {
        report,
        npmAudit: options.npmAudit || detectNpmAuditSummary(projectRoot),
        productionProfile: options.productionProfile || detectProductionAuthProfile(projectRoot)
    };
}

function evaluateRule(rule, context) {
    const { report, npmAudit, productionProfile } = context;
    const base = {
        id: rule.id,
        title: rule.title,
        category: rule.category,
        severity: rule.severity,
        remediation: rule.remediation || null
    };

    switch (rule.check) {
        case 'gate-pass': {
            const pass = Boolean(report.gate?.pass);
            return {
                ...base,
                status: pass ? 'pass' : 'fail',
                evidence: pass
                    ? 'Gate pass — no blocking issues at configured severities'
                    : `Gate fail — ${report.gate?.blockingCount ?? report.severityCounts?.high ?? '?'} blocking issue(s)`
            };
        }
        case 'zero-credential-findings': {
            const findings = report.credentialFindings ?? 0;
            return {
                ...base,
                status: findings === 0 ? 'pass' : 'fail',
                evidence: findings === 0
                    ? `Scanned ${report.credentialScanned ?? 0} path(s) — no credential patterns`
                    : `${findings} credential pattern(s) detected`
            };
        }
        case 'zero-production-leaks': {
            const findings = report.productionLeakFindings ?? 0;
            return {
                ...base,
                status: findings === 0 ? 'pass' : 'fail',
                evidence: findings === 0
                    ? `Scanned ${report.productionLeakScanned ?? 0} production file(s) — no sample-path leaks`
                    : `${findings} production leak(s) — mock/sample paths in prod code`
            };
        }
        case 'schema-compliance': {
            const checked = report.schemaChecked ?? 0;
            if (!checked) {
                return { ...base, status: 'skip', evidence: 'No registered page samples in this project' };
            }
            const passed = report.schemaPassed ?? 0;
            const ok = passed === checked;
            return {
                ...base,
                status: ok ? 'pass' : 'fail',
                evidence: ok
                    ? `${passed}/${checked} samples match schema specs`
                    : `${passed}/${checked} samples pass schema — fix violations in report`
            };
        }
        case 'consistency-pass': {
            if (report.consistencyChecked == null || report.consistencyChecked === 0) {
                return { ...base, status: 'skip', evidence: 'Consistency anchors not configured for this profile' };
            }
            const ok = report.consistencyPassed === true || report.consistencyScore >= 95;
            return {
                ...base,
                status: ok ? 'pass' : 'fail',
                evidence: ok
                    ? `Consistency score ${report.consistencyScore ?? '—'}% — no fiction KPI drift`
                    : `Consistency score ${report.consistencyScore ?? '—'}% — fiction or baseline drift detected`
            };
        }
        case 'npm-no-critical-high': {
            if (!npmAudit?.summary) {
                return { ...base, status: 'skip', evidence: 'No package.json — npm audit not applicable' };
            }
            const critical = npmAudit.summary.critical || 0;
            const high = npmAudit.summary.high || 0;
            const ok = critical === 0 && high === 0;
            return {
                ...base,
                status: ok ? 'pass' : 'fail',
                evidence: ok
                    ? `npm audit: 0 critical, 0 high (${npmAudit.source || 'scan'})`
                    : `npm audit: ${critical} critical, ${high} high — upgrade dependencies`
            };
        }
        case 'npm-moderate-limit': {
            if (!npmAudit?.summary) {
                return { ...base, status: 'skip', evidence: 'No package.json — npm audit not applicable' };
            }
            const limit = rule.maxModerate ?? 0;
            const moderate = npmAudit.summary.moderate || npmAudit.summary.medium || 0;
            const ok = moderate <= limit;
            return {
                ...base,
                status: ok ? 'pass' : 'fail',
                evidence: ok
                    ? `${moderate} moderate (limit ${limit})`
                    : `${moderate} moderate exceeds policy limit of ${limit}`
            };
        }
        case 'production-auth-profile': {
            if (!productionProfile) {
                return { ...base, status: 'skip', evidence: 'Production profile not evaluated' };
            }
            if (!fs.existsSync(path.join(path.resolve(report.projectRoot || ''), '.env.production'))) {
                return { ...base, status: 'skip', evidence: '.env.production not present (local/dev repo)' };
            }
            return {
                ...base,
                status: productionProfile.configured ? 'pass' : 'fail',
                evidence: productionProfile.reason
            };
        }
        default:
            return { ...base, status: 'skip', evidence: `Unknown check: ${rule.check}` };
    }
}

function evaluateComplianceChecklist(report, options = {}) {
    const projectRoot = options.projectRoot || report.projectRoot || '';
    const checklist = options.checklist || loadComplianceChecklist(projectRoot);
    const context = buildEvaluationContext(report, options);
    const rules = (checklist.rules || []).map((rule) => evaluateRule(rule, context));

    const passed = rules.filter((r) => r.status === 'pass').length;
    const failed = rules.filter((r) => r.status === 'fail').length;
    const skipped = rules.filter((r) => r.status === 'skip').length;
    const scored = passed + failed;
    const score = scored ? Math.round((passed / scored) * 100) : null;

    return {
        type: 'simplebeacon-compliance-checklist',
        version: checklist.version || '1.0.0',
        title: checklist.title || 'Simplebeacon Corporate Safety Checklist',
        description: checklist.description || null,
        evaluatedAt: new Date().toISOString(),
        projectRoot: projectRoot || report.projectRoot || '',
        summary: {
            passed,
            failed,
            skipped,
            total: rules.length,
            score,
            readyForAutomation: failed === 0 && passed > 0,
            headline: failed === 0 && passed > 0
                ? `${passed}/${scored} applicable rules pass — safe to enable automated AI deploy gates`
                : failed > 0
                    ? `${failed} rule(s) fail — fix before handing operations to AI-generated code`
                    : skipped === rules.length
                        ? 'Checklist not evaluated — stale compliance output was ignored; re-run assess or compliance'
                        : 'No scored rules — review scan report manually'
        },
        rules
    };
}

module.exports = {
    loadComplianceChecklist,
    evaluateComplianceChecklist,
    evaluateRule,
    detectNpmAuditSummary,
    detectProductionAuthProfile,
    DEFAULT_CHECKLIST
};
