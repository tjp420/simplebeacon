/**
 * Agency pre-launch handoff patterns — deploy leaks, auth misconfig, AI telemetry, webhooks, repo integrity.
 */

const fs = require('fs');
const path = require('path');
const { globMatch, walkProductionFiles } = require('./production-leak');

const DEFAULT_SOURCE_PATHS = ['server', 'src', 'web', 'lib', 'packages', 'app', 'api', 'config'];
const DEFAULT_PRODUCTION_PATHS = ['server/', 'src/', 'app/', 'lib/', 'api/'];
const SCANNABLE_EXTENSIONS = new Set([
    '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.html', '.vue', '.svelte',
    '.json', '.env', '.yaml', '.yml', '.toml', '.sh', '.ps1'
]);
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'coverage', 'dist', 'build', 'archive',
    '.simplebeacon', 'tests', 'test', '__tests__', 'fixtures', 'docs', 'deliverables',
    'rules', 'reporters', 'analyzers', 'proxy', 'examples'
]);

function isScannerImplementationPath(relativePath) {
    const normalized = String(relativePath || '').replace(/\\/g, '/').toLowerCase();
    if (/(?:^|\/)src\/(?:rules|reporters|analyzers|proxy)(?:\/|$)/.test(normalized)) return true;
    if (/(?:^|\/)packages\/simplebeacon-cli\/src\/(?:rules|reporters|analyzers|proxy|lib)\//.test(normalized)) return true;
    if (/\/simplebeacon-cli\/src\/(?:rules|reporters|analyzers|proxy|lib)\//.test(normalized)) return true;
    return false;
}
const MAX_SCAN_BYTES = 512000;

const ENV_COMMIT_NAMES = new Set([
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    '.env.staging',
    '.env.test'
]);

const RULE_CATALOG = [
    {
        id: 'SB-DEPLOY-001',
        category: 'deploy-leak',
        type: 'Deploy Leak',
        regex: /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{2,5}/gi,
        severity: 'high',
        description: 'Localhost or loopback URL with port in production-eligible code'
    },
    {
        id: 'SB-DEPLOY-002',
        category: 'deploy-leak',
        type: 'Deploy Leak',
        regex: /NODE_ENV\s*[=:]\s*['"]development['"]/gi,
        severity: 'high',
        description: 'NODE_ENV set to development in config or source'
    },
    {
        id: 'SB-DEPLOY-003',
        category: 'deploy-leak',
        type: 'Deploy Leak',
        regex: /REQUIRE_AUTH\s*[=:]\s*['"]?false\b/gi,
        severity: 'critical',
        description: 'Authentication explicitly disabled (REQUIRE_AUTH=false)'
    },
    {
        id: 'SB-DEPLOY-004',
        category: 'deploy-leak',
        type: 'Deploy Leak',
        regex: /(?:DEBUG|DEBUG_LOGS|LOG_QUERIES)\s*[=:]\s*['"]?true\b/gi,
        severity: 'medium',
        description: 'Debug logging flag enabled in config or source'
    },
    {
        id: 'SB-DEPLOY-005',
        category: 'deploy-leak',
        type: 'Deploy Leak',
        regex: /https?:\/\/(?:staging|dev|preview|localhost)[.\w-]*/gi,
        severity: 'medium',
        description: 'Staging or dev hostname referenced in source'
    },
    {
        id: 'SB-AUTH-001',
        category: 'auth-misconfig',
        type: 'Auth Misconfiguration',
        regex: /(?:origin|Access-Control-Allow-Origin)\s*[:=]\s*['"]\*['"]/gi,
        severity: 'high',
        description: 'Wildcard CORS origin — overly permissive cross-origin access'
    },
    {
        id: 'SB-AUTH-002',
        category: 'auth-misconfig',
        type: 'Auth Misconfiguration',
        regex: /(?:BYPASS_AUTH|SKIP_AUTH|ALLOW_DEV_EPHEMERAL|AUTH_BYPASS)\s*[=:]\s*['"]?true\b/gi,
        severity: 'critical',
        description: 'Auth bypass flag enabled'
    },
    {
        id: 'SB-AUTH-003',
        category: 'auth-misconfig',
        type: 'Auth Misconfiguration',
        regex: /(?:password|passwd)\s*[:=]\s*['"](?:demo123|admin|password|changeme)['"]/gi,
        severity: 'high',
        description: 'Hardcoded demo or default password'
    },
    {
        id: 'SB-AUTH-004',
        category: 'auth-misconfig',
        type: 'Auth Misconfiguration',
        regex: /JWT_SECRET\s*[=:]\s*['"][^'"\s]{8,}['"]/gi,
        severity: 'high',
        description: 'JWT secret hardcoded in source (use env / secret manager)'
    },
    {
        id: 'SB-AI-001',
        category: 'ai-telemetry-leak',
        type: 'AI Telemetry Leak',
        regex: /console\.(?:log|debug|info)\([^)]*(?:prompt|completion|messages|openai|anthropic|llm)/gi,
        severity: 'medium',
        description: 'Console logging of AI prompts or completions in production path'
    },
    {
        id: 'SB-AI-002',
        category: 'ai-telemetry-leak',
        type: 'AI Telemetry Leak',
        regex: /logger\.(?:debug|info|log)\([^)]*(?:prompt|completion|chat\.completions)/gi,
        severity: 'medium',
        description: 'Structured logger may emit AI prompt/completion content'
    },
    {
        id: 'SB-HANDOFF-001',
        category: 'handoff-integrity',
        type: 'Handoff Integrity',
        regex: /^<<<<<<<|^=======|^>>>>>>>/gm,
        severity: 'critical',
        description: 'Unresolved Git merge conflict marker'
    },
    {
        id: 'SB-SEC-001',
        category: 'web-security',
        type: 'Web Security Risk',
        regex: /\beval\s*\(|new\s+Function\s*\(|dangerouslySetInnerHTML/g,
        severity: 'high',
        description: 'Dynamic code execution or unsanitized HTML injection API'
    },
    {
        id: 'SB-SEC-002',
        category: 'web-security',
        type: 'Web Security Risk',
        regex: /(?:redirect|res\.redirect)\([^)]*(?:req\.query|req\.params|req\.body)/gi,
        severity: 'medium',
        description: 'Possible open redirect from user-controlled input'
    }
];

const ALLOWLIST_SNIPPETS = [
    'example.com',
    'localhost:54355',
    '127.0.0.1:54355',
    'placeholder',
    'your-secret',
    'replace-with',
    'changeme',
    'demo@simplebeacon.ai',
    'agency-handoff-patterns.js',
    'not-a-real',
    'process.env',
    'env.example',
    '.env.example'
];

function normalizeRel(baseDir, filePath) {
    return path.relative(baseDir, filePath).split(path.sep).join('/');
}

function lineNumberAt(content, index) {
    return content.slice(0, Math.max(0, index)).split('\n').length;
}

function isExcludedPath(relativePath) {
    const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
    if (isScannerImplementationPath(relativePath)) return true;
    if (/\.(test|spec)\.[jt]sx?$/.test(normalized)) return true;
    if (/\/tests?\//.test(normalized)) return true;
    if (/\/fixtures?\//.test(normalized)) return true;
    if (/\.example\.[a-z0-9]+$/i.test(normalized)) return true;
    if (normalized.endsWith('.md')) return true;
    return false;
}

function isAllowlistedMatch(line, matchText) {
    const snippet = `${line} ${matchText}`.toLowerCase();
    return ALLOWLIST_SNIPPETS.some((token) => snippet.includes(token));
}

function isCommentLine(line, ext) {
    const trimmed = line.trim();
    if (ext === '.py' && trimmed.startsWith('#')) return true;
    if (/^(\/\/|\/\*|\*)/.test(trimmed)) return true;
    return false;
}

function scanWebhookFileRisk(relativePath, content) {
    if (!/\/webhook/i.test(relativePath) && !/webhook/i.test(content.slice(0, 8000))) return [];
    if (/constructEvent|verifyHeader|createHmac|stripe\.webhooks|Webhook\.sign/i.test(content)) return [];
    if (!/(?:app|router)\.(?:post|use)\(\s*['"][^'"]*webhook/i.test(content)) return [];
    return [{
        id: `agency-handoff-SB-WEBHOOK-001-${relativePath}`,
        severity: 'high',
        severityBand: 'high',
        type: 'Webhook Risk',
        category: 'webhook-unsafe',
        filePath: relativePath,
        file: relativePath,
        line: 1,
        pattern: 'SB-WEBHOOK-001',
        count: 1,
        description: `${relativePath} — webhook route without obvious signature verification`,
        recommendation: 'Verify webhook signatures (e.g. Stripe constructEvent) before processing body.',
        recommendedAction: 'Verify webhook signatures (e.g. Stripe constructEvent) before processing body.',
        affectedFiles: [path.basename(relativePath)],
        metadata: { patternId: 'SB-WEBHOOK-001', category: 'webhook-unsafe' }
    }];
}

function scanTextPatterns(relativePath, content, ext) {
    const findings = [];
    if (isExcludedPath(relativePath)) return findings;

    for (const rule of RULE_CATALOG) {
        rule.regex.lastIndex = 0;
        let match;
        while ((match = rule.regex.exec(content)) !== null) {
            const lineIndex = lineNumberAt(content, match.index) - 1;
            const line = content.split('\n')[lineIndex] || '';
            if (isCommentLine(line, ext) && !rule.id.startsWith('SB-HANDOFF')) continue;
            if (isAllowlistedMatch(line, match[0])) continue;
            if (rule.id === 'SB-DEPLOY-001' && /localhost:54355|127\.0\.0\.1:54355/.test(match[0])) continue;

            findings.push({
                id: `agency-handoff-${rule.id}-${relativePath}-${match.index}`,
                severity: rule.severity,
                severityBand: rule.severity,
                type: rule.type,
                category: rule.category,
                filePath: relativePath,
                file: relativePath,
                line: lineIndex + 1,
                pattern: rule.id,
                count: 1,
                description: `${relativePath}:${lineIndex + 1} — ${rule.description}`,
                recommendation: recommendationForRule(rule),
                recommendedAction: recommendationForRule(rule),
                affectedFiles: [path.basename(relativePath)],
                metadata: {
                    patternId: rule.id,
                    category: rule.category,
                    offset: match.index,
                    match: match[0].slice(0, 120)
                }
            });
        }
    }
    findings.push(...scanWebhookFileRisk(relativePath, content));
    return findings;
}

function recommendationForRule(rule) {
    switch (rule.category) {
        case 'deploy-leak':
            return 'Use environment variables for host URLs; set NODE_ENV=production and REQUIRE_AUTH=true on deploy hosts.';
        case 'auth-misconfig':
            return 'Restrict CORS to known origins; remove bypass flags; rotate any hardcoded secrets.';
        case 'ai-telemetry-leak':
            return 'Remove prompt/completion logging from production paths or redact before emit.';
        case 'webhook-unsafe':
            return 'Verify webhook signatures (e.g. Stripe constructEvent) before processing body.';
        case 'handoff-integrity':
            return 'Resolve merge conflict markers before client handoff.';
        case 'web-security':
            return 'Replace eval/dynamic HTML with safe alternatives; validate redirect targets.';
        default:
            return 'Review and remediate before client handoff.';
    }
}

async function walkSourceFiles(baseDir, sourcePaths, files, depth = 0) {
    if (depth > 8) return;
    for (const rel of sourcePaths) {
        const abs = path.join(baseDir, ...rel.split('/'));
        if (!fs.existsSync(abs)) continue;
        const stat = fs.statSync(abs);
        if (stat.isFile()) {
            files.push({ path: abs, ext: path.extname(abs).toLowerCase() });
            continue;
        }
        await walkDir(abs, baseDir, files, depth);
    }
}

async function walkDir(dir, baseDir, files, depth) {
    if (depth > 8) return;
    let entries;
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            await walkDir(path.join(dir, entry.name), baseDir, files, depth + 1);
            continue;
        }
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!SCANNABLE_EXTENSIONS.has(ext) && !ENV_COMMIT_NAMES.has(entry.name.toLowerCase())) continue;
        files.push({ path: path.join(dir, entry.name), ext });
    }
}

function scanEnvCommitRisk(baseDir) {
    const issues = [];
    const gitignorePath = path.join(baseDir, '.gitignore');
    let gitignoreLines = [];
    if (fs.existsSync(gitignorePath)) {
        gitignoreLines = fs.readFileSync(gitignorePath, 'utf8')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'));
    }
    const isGitignoredEnv = (name) => gitignoreLines.some((line) => line === name
        || (line === '.env' && name.startsWith('.env')));

    for (const name of ENV_COMMIT_NAMES) {
        const abs = path.join(baseDir, name);
        if (!fs.existsSync(abs)) continue;
        if (isGitignoredEnv(name)) continue;
        issues.push({
            id: `agency-handoff-env-commit-${name}`,
            severity: 'critical',
            severityBand: 'critical',
            type: 'Env Commit Risk',
            category: 'env-commit',
            filePath: name,
            file: name,
            line: 1,
            pattern: 'SB-ENV-001',
            count: 1,
            description: `${name} exists at repository root — secrets may be committed`,
            recommendation: 'Move secrets to host env or secret manager; keep only .env.example in git.',
            recommendedAction: 'Move secrets to host env or secret manager; keep only .env.example in git.',
            affectedFiles: [name],
            metadata: { patternId: 'SB-ENV-001', category: 'env-commit' }
        });
    }
    return issues;
}

function scanHandoffIntegrity(baseDir) {
    const issues = [...scanEnvCommitRisk(baseDir)];
    const pkgPath = path.join(baseDir, 'package.json');
    const lockPath = path.join(baseDir, 'package-lock.json');
    if (fs.existsSync(pkgPath) && !fs.existsSync(lockPath)) {
        issues.push({
            id: 'agency-handoff-missing-lockfile',
            severity: 'medium',
            severityBand: 'medium',
            type: 'Handoff Integrity',
            category: 'handoff-integrity',
            filePath: 'package.json',
            file: 'package.json',
            line: 1,
            pattern: 'SB-HANDOFF-002',
            count: 1,
            description: 'package.json present but package-lock.json missing — non-reproducible installs',
            recommendation: 'Run npm install and commit package-lock.json before handoff.',
            recommendedAction: 'Run npm install and commit package-lock.json before handoff.',
            affectedFiles: ['package.json'],
            metadata: { patternId: 'SB-HANDOFF-002', category: 'handoff-integrity' }
        });
    }

    const gitignorePath = path.join(baseDir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gi = fs.readFileSync(gitignorePath, 'utf8');
        if (!/^\.env$/m.test(gi) && !/^\.env\*$/m.test(gi) && !/\.env\.local/.test(gi)) {
            issues.push({
                id: 'agency-handoff-gitignore-env',
                severity: 'medium',
                severityBand: 'medium',
                type: 'Handoff Integrity',
                category: 'handoff-integrity',
                filePath: '.gitignore',
                file: '.gitignore',
                line: 1,
                pattern: 'SB-HANDOFF-003',
                count: 1,
                description: '.gitignore may not exclude .env files',
                recommendation: 'Add .env, .env.local, and .env.production to .gitignore.',
                recommendedAction: 'Add .env, .env.local, and .env.production to .gitignore.',
                affectedFiles: ['.gitignore'],
                metadata: { patternId: 'SB-HANDOFF-003', category: 'handoff-integrity' }
            });
        }
    }
    return issues;
}

async function scanAgencyHandoffPatterns(baseDir, options = {}) {
    const sourcePaths = options.sourcePaths || DEFAULT_SOURCE_PATHS;
    const productionPaths = options.productionPaths || DEFAULT_PRODUCTION_PATHS;
    const ignoreGlobs = options.ignoreGlobs || [];
    const severityDefault = options.severity || 'medium';

    const repoIssues = scanHandoffIntegrity(baseDir);
    const files = [];
    await walkSourceFiles(baseDir, sourcePaths, files);

    for (const rel of productionPaths) {
        const abs = path.join(baseDir, ...rel.replace(/\/$/, '').split('/'));
        if (fs.existsSync(abs)) {
            await walkProductionFiles(abs, files);
        }
    }

    const seen = new Set();
    const uniqueFiles = [];
    for (const file of files) {
        const key = file.path;
        if (seen.has(key)) continue;
        seen.add(key);
        uniqueFiles.push(file);
    }

    const issues = [...repoIssues];
    let scanned = 0;

    for (const file of uniqueFiles) {
        const relativePath = normalizeRel(baseDir, file.path);
        if (ignoreGlobs.some((g) => globMatch(relativePath, g))) continue;
        if (isExcludedPath(relativePath)) continue;

        let content;
        try {
            const stat = await fs.promises.stat(file.path);
            if (stat.size > MAX_SCAN_BYTES) continue;
            content = await fs.promises.readFile(file.path, 'utf8');
        } catch {
            continue;
        }

        scanned += 1;
        const ext = file.ext || path.extname(file.path).toLowerCase();
        issues.push(...scanTextPatterns(relativePath, content, ext));
    }

    for (const issue of issues) {
        if (!issue.severity) issue.severity = severityDefault;
    }

    return {
        scanned,
        findings: issues.length,
        issues,
        patterns: RULE_CATALOG.map((r) => r.id)
    };
}

module.exports = {
    RULE_CATALOG,
    scanTextPatterns,
    scanHandoffIntegrity,
    scanAgencyHandoffPatterns,
    DEFAULT_SOURCE_PATHS,
    DEFAULT_PRODUCTION_PATHS
};
