/**
 * Lightweight secret/credential pattern scan for mock-data and production paths.
 */

const fs = require('fs');
const path = require('path');
const { walkProductionFiles, globMatch } = require('../rules/production-leak');

const CREDENTIAL_PATTERNS = [
    { id: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/g, severity: 'high' },
    { id: 'github-pat', regex: /\bghp_[A-Za-z0-9]{20,}\b/g, severity: 'high' },
    { id: 'github-oauth', regex: /\bgho_[A-Za-z0-9]{20,}\b/g, severity: 'high' },
    { id: 'openai-key', regex: /\bsk-[A-Za-z0-9]{20,}\b/g, severity: 'high' },
    { id: 'jwt-token', regex: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, severity: 'high' },
    { id: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, severity: 'high' },
    { id: 'stripe-key', regex: /\b(sk|pk)_(test|live)_[A-Za-z0-9]{16,}\b/g, severity: 'high' },
    { id: 'database-url', regex: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi, severity: 'high' },
    { id: 'sendgrid-key', regex: /\bSG\.[A-Za-z0-9_-]{20,}\b/g, severity: 'high' },
    { id: 'resend-key', regex: /\bre_[A-Za-z0-9]{20,}\b/g, severity: 'high' },
    { id: 'firebase-key', regex: /"private_key"\s*:\s*"-----BEGIN/g, severity: 'high' },
    { id: 'generic-api-key', regex: /\b(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][^'"\s]{12,}['"]/gi, severity: 'medium' },
    { id: 'bearer-token', regex: /Bearer\s+[A-Za-z0-9._-]{20,}/g, severity: 'medium' },
    { id: 'private-key-block', regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: 'high' }
];

const ALLOWLIST_SNIPPETS = [
    'demo123',
    'dev@simplebeacon.ai',
    'your-api-key-here',
    'your-secret-key',
    'your_secret_key',
    'your_secret',
    '<your-',
    'placeholder',
    'example.com',
    'xxxxxxxx',
    'replace_me',
    'changeme',
    'dummy',
    'test-only',
    'not-a-real',
    'hardcoded-secret-for-unit-test',
    'secret-key-for-unit-test',
    'cascade-secret-key-2024-secure',
    'sk_test_your',
    'sk_test_123456789',
    'pk_test_1234567890abcdef',
    'pk_test_51234567890abcdef',
    '51234567890abcdef',
    '1234567890abcdef',
    'kh9nv',
    'AKIAIOSFODNN7EXAMPLE',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0'
];

const SCANNABLE_EXTENSIONS = new Set(['.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.env', '.yaml', '.yml', '.txt', '.md']);
const MAX_SCAN_BYTES = 256000;

function lineNumberAt(content, index) {
    return content.slice(0, Math.max(0, index)).split('\n').length;
}

function severityBandForPattern(patternId) {
    if (['private-key-block', 'aws-access-key', 'github-pat', 'github-oauth', 'openai-key', 'stripe-key'].includes(patternId)) {
        return 'critical';
    }
    if (['jwt-token', 'slack-token'].includes(patternId)) {
        return 'high';
    }
    return 'medium';
}

function isAllowlisted(match, content, fileName = '') {
    const snippet = content.slice(Math.max(0, match.index - 24), match.index + match[0].length + 24);
    const lower = snippet.toLowerCase();
    if (ALLOWLIST_SNIPPETS.some((allowed) => lower.includes(allowed.toLowerCase()))) {
        return true;
    }

    // Ignore placeholder bearer tokens in test fixture modules.
    if (/bearer\s+test-token-placeholder/i.test(match[0])) {
        return true;
    }

    // auth strategy scaffolding often includes apiKey variable names without secrets.
    if (/auth-strategies\.js$/i.test(fileName)
        && /\b(api[_-]?key|secret[_-]?key|access[_-]?token)\b/i.test(match[0])) {
        return true;
    }

    return false;
}

function scanTextContent(fileName, content, filePath = fileName) {
    const findings = [];

    for (const pattern of CREDENTIAL_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(content)) !== null) {
            if (isAllowlisted(match, content, fileName)) continue;
            const line = lineNumberAt(content, match.index);
            const severityBand = severityBandForPattern(pattern.id);
            const recommendation = severityBand === 'critical'
                ? 'Immediately remove and rotate this credential; store only via environment/secret manager bindings'
                : severityBand === 'high'
                    ? 'Remove token-like material from source control and rotate if it was ever exposed'
                    : 'Replace hardcoded token/value with environment-backed configuration and verify this is not a real secret';
            findings.push({
                id: `${pattern.id}-${fileName}-${match.index}`,
                severity: severityBand === 'critical' ? 'high' : pattern.severity,
                severityBand,
                type: 'Credential Pattern',
                filePath,
                file: filePath,
                line,
                pattern: pattern.id,
                count: 1,
                description: `${filePath}:${line} possible ${pattern.id.replace(/-/g, ' ')}`,
                recommendation,
                recommendedAction: recommendation,
                affectedFiles: [fileName],
                metadata: {
                    patternId: pattern.id,
                    offset: match.index,
                    findingPayload: {
                        file: filePath,
                        line,
                        pattern: pattern.id,
                        recommendation
                    }
                }
            });
        }
    }

    return findings;
}

async function scanCredentialPatterns(files, options = {}) {
    const issues = [];
    let scanned = 0;

    for (const file of files) {
        if (!SCANNABLE_EXTENSIONS.has(file.ext)) continue;
        if (file.size > MAX_SCAN_BYTES) continue;

        let content;
        try {
            content = await fs.promises.readFile(file.path, 'utf8');
        } catch {
            continue;
        }

        scanned += 1;
        issues.push(...scanTextContent(file.name, content, file.path));
    }

    if (options.scanProduction && options.baseDir && options.productionPaths?.length) {
        const prodFiles = [];
        for (const rel of options.productionPaths) {
            const abs = path.isAbsolute(rel)
                ? rel
                : path.join(options.baseDir, ...rel.split('/'));
            if (fs.existsSync(abs)) {
                await walkProductionFiles(abs, prodFiles);
            }
        }

        const ignoreGlobs = options.ignoreGlobs || [];
        for (const file of prodFiles) {
            const relativePath = path.relative(options.baseDir, file.path).split(path.sep).join('/');
            if (ignoreGlobs.some((pattern) => globMatch(relativePath, pattern))) continue;
            if (!SCANNABLE_EXTENSIONS.has(file.ext)) continue;
            if (file.size > MAX_SCAN_BYTES) continue;

            let content;
            try {
                content = await fs.promises.readFile(file.path, 'utf8');
            } catch {
                continue;
            }

            scanned += 1;
            const hits = scanTextContent(file.name, content, relativePath);
            issues.push(...hits.map((hit) => ({
                ...hit,
                description: `${relativePath}: possible ${hit.metadata.patternId.replace(/-/g, ' ')} in production path`
            })));
        }
    }

    return {
        scanned,
        findings: issues.length,
        issues
    };
}

module.exports = {
    CREDENTIAL_PATTERNS,
    scanCredentialPatterns,
    scanTextContent
};
