/**
 * Redact secret-like substrings before reports leave the customer machine or persist on server.
 */

const REDACTION_RULES = [
    { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: 'AKIA████████████████' },
    { pattern: /\bghp_[A-Za-z0-9]{20,}\b/g, replacement: 'ghp_████████████████' },
    { pattern: /\bgho_[A-Za-z0-9]{20,}\b/g, replacement: 'gho_████████████████' },
    { pattern: /\bsk-[A-Za-z0-9]{20,}\b/g, replacement: 'sk-████████████████████' },
    { pattern: /\b(sk|pk)_(test|live)_[A-Za-z0-9]{16,}\b/g, replacement: '$1_$2_████████████████' },
    { pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, replacement: 'eyJ…[REDACTED_JWT]' },
    { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, replacement: 'xox…[REDACTED]' },
    { pattern: /Bearer\s+[A-Za-z0-9._-]{20,}/g, replacement: 'Bearer [REDACTED]' },
    { pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, replacement: '[REDACTED_PRIVATE_KEY_BLOCK]' },
    {
        pattern: /\b(api[_-]?key|secret[_-]?key|access[_-]?token|password)\s*[:=]\s*['"][^'"\s]{8,}['"]/gi,
        replacement: '$1: "[REDACTED]"'
    }
];

function redactSecretsInString(value) {
    if (typeof value !== 'string' || !value) return value;
    let out = value;
    for (const rule of REDACTION_RULES) {
        out = out.replace(rule.pattern, rule.replacement);
    }
    return out;
}

function sanitizeValue(value) {
    if (typeof value === 'string') return redactSecretsInString(value);
    if (Array.isArray(value)) return value.map(sanitizeValue);
    if (value && typeof value === 'object') return sanitizePlainObject(value);
    return value;
}

function sanitizePlainObject(obj) {
    const next = {};
    for (const [key, value] of Object.entries(obj)) {
        next[key] = sanitizeValue(value);
    }
    return next;
}

function sanitizeIssue(issue) {
    if (!issue || typeof issue !== 'object') return issue;
    return sanitizePlainObject(issue);
}

function sanitizeScanReport(report, options = {}) {
    if (!report || typeof report !== 'object') return report;
    const sanitized = sanitizePlainObject(report);

    if (Array.isArray(sanitized.rawIssues)) {
        sanitized.rawIssues = sanitized.rawIssues.map(sanitizeIssue);
    }
    if (Array.isArray(sanitized.detectedIssues)) {
        sanitized.detectedIssues = sanitized.detectedIssues.map(sanitizeIssue);
    }

    if (options.stripRawIssues) {
        delete sanitized.rawIssues;
        delete sanitized.sampleFiles;
    }

    sanitized.sanitized = true;
    sanitized.sanitizedAt = new Date().toISOString();
    return sanitized;
}

function sanitizeAssessment(assessment, options = {}) {
    if (!assessment || typeof assessment !== 'object') return assessment;
    const sanitized = sanitizePlainObject(assessment);

    if (sanitized.findings && typeof sanitized.findings === 'object') {
        for (const bucket of Object.values(sanitized.findings)) {
            if (bucket?.items && Array.isArray(bucket.items)) {
                bucket.items = bucket.items.map(sanitizeIssue);
            }
            if (bucket?.summary) bucket.summary = redactSecretsInString(bucket.summary);
        }
    }

    if (sanitized.complianceChecklist?.rules) {
        sanitized.complianceChecklist.rules = sanitized.complianceChecklist.rules.map((rule) => sanitizePlainObject(rule));
    }

    if (sanitized.metadata) {
        sanitized.metadata = sanitizePlainObject(sanitized.metadata);
    }

    if (options.stripSourceReport) {
        delete sanitized.sourceReport;
    }

    sanitized.sanitized = true;
    sanitized.sanitizedAt = new Date().toISOString();
    return sanitized;
}

function sanitizeReportForCloudUpload(report) {
    return sanitizeScanReport(report, { stripRawIssues: true });
}

function normalizeSeverity(value) {
    return String(value || 'low').toLowerCase();
}

function collectIssuesFromScan(rawScanJson) {
    if (!rawScanJson || typeof rawScanJson !== 'object') return [];
    if (Array.isArray(rawScanJson.issues)) return rawScanJson.issues;
    if (Array.isArray(rawScanJson.rawIssues)) return rawScanJson.rawIssues;
    if (Array.isArray(rawScanJson.detectedIssues)) return rawScanJson.detectedIssues;
    if (Array.isArray(rawScanJson.findings)) return rawScanJson.findings;

    const collected = [];
    const simplebeacon = rawScanJson.results?.simplebeacon || rawScanJson.simplebeacon;
    if (simplebeacon) {
        collected.push(...(simplebeacon.rawIssues || simplebeacon.detectedIssues || []));
    }
    const codebase = rawScanJson.results?.codebase || rawScanJson.codebase;
    if (codebase?.findings) {
        collected.push(...codebase.findings);
    }
    return collected;
}

function countIssueSeverities(issues = []) {
    return issues.reduce((acc, issue) => {
        const band = normalizeSeverity(issue.severity);
        if (band === 'critical' || band === 'high' || band === 'medium' || band === 'low') {
            acc[band] += issue.count || 1;
        } else {
            acc.low += issue.count || 1;
        }
        return acc;
    }, { critical: 0, high: 0, medium: 0, low: 0 });
}

function resolveGateStatus(rawScanJson) {
    const gatePass = rawScanJson.gate?.pass
        ?? rawScanJson.results?.simplebeacon?.gate?.pass
        ?? rawScanJson.summary?.simplebeaconGatePass;
    if (gatePass === true) return 'PASS';
    if (gatePass === false) return 'FAIL';
    return 'REVIEW';
}

function resolveFilesScanned(rawScanJson) {
    return rawScanJson.summary?.codeFilesAnalyzed
        ?? rawScanJson.summary?.files
        ?? rawScanJson.codeFilesAnalyzed
        ?? rawScanJson.filesAnalyzed
        ?? rawScanJson.repositoryFilesTotal
        ?? rawScanJson.results?.codebase?.summary?.codeFilesAnalyzed
        ?? null;
}

/**
 * Strips line locations and code snippets from public scan results.
 * Keeps high-level counts to show the danger, but hides the fix.
 * @param {Object} rawScanJson - Complete internal scan database object.
 * @returns {Object} Sanitized public summary safe for browser display.
 */
function sanitizePublicOutput(rawScanJson) {
    const issues = collectIssuesFromScan(rawScanJson);
    const severityCounts = countIssueSeverities(issues);
    const totalIssuesFound = issues.reduce((sum, issue) => sum + (issue.count || 1), 0);

    return {
        summary: {
            filesScanned: resolveFilesScanned(rawScanJson),
            status: resolveGateStatus(rawScanJson),
            totalIssuesFound,
            gatePass: rawScanJson.gate?.pass
                ?? rawScanJson.results?.simplebeacon?.gate?.pass
                ?? rawScanJson.summary?.simplebeaconGatePass
                ?? null,
            qualityScore: rawScanJson.qualityScore
                ?? rawScanJson.results?.simplebeacon?.qualityScore
                ?? null,
            codeHealth: rawScanJson.summary?.codebaseHealthScore
                ?? rawScanJson.results?.codebase?.summary?.healthScore
                ?? null
        },
        severityCounts,
        publicGateLocked: true,
        issues: []
    };
}

function stripSensitiveScanFields(report) {
    if (!report || typeof report !== 'object') return report;
    const next = sanitizePlainObject(report);
    next.rawIssues = [];
    next.detectedIssues = [];
    if (Array.isArray(next.findings)) next.findings = [];
    if (next.results && typeof next.results === 'object') {
        next.results = sanitizePlainObject(next.results);
        if (next.results.codebase?.findings) {
            next.results.codebase = {
                ...next.results.codebase,
                findings: []
            };
        }
        if (next.results.simplebeacon) {
            next.results.simplebeacon = {
                ...next.results.simplebeacon,
                rawIssues: [],
                detectedIssues: []
            };
        }
    }
    next.publicGateLocked = true;
    return next;
}

function applyPublicGateToAnalyzeResponse(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const scanRoot = payload.report
        || payload.data
        || payload.completeScan
        || payload;
    const publicSummary = sanitizePublicOutput(scanRoot);
    const next = {
        ...payload,
        publicGateLocked: true,
        publicSummary
    };
    if (next.report) next.report = stripSensitiveScanFields(next.report);
    if (next.data) next.data = stripSensitiveScanFields(next.data);
    if (next.completeScan) next.completeScan = stripSensitiveScanFields(next.completeScan);
    return next;
}

module.exports = {
    redactSecretsInString,
    sanitizeScanReport,
    sanitizeAssessment,
    sanitizeReportForCloudUpload,
    sanitizePublicOutput,
    applyPublicGateToAnalyzeResponse,
    collectIssuesFromScan,
    stripSensitiveScanFields
};
