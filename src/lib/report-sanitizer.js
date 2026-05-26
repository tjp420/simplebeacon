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

module.exports = {
    redactSecretsInString,
    sanitizeScanReport,
    sanitizeAssessment,
    sanitizeReportForCloudUpload
};
