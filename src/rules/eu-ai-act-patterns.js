/**
 * EU AI Act readiness patterns — high-risk indicators (Annex III), Article 50
 * transparency, and documentation completeness signals.
 *
 * Static pattern scan only — not legal advice or formal conformity assessment.
 */

const fs = require('fs');
const path = require('path');
const { globMatch, walkProductionFiles } = require('./production-leak');

const DEFAULT_SOURCE_PATHS = ['server', 'src', 'web', 'lib', 'packages', 'app', 'api', 'config', 'docs'];
const DEFAULT_PRODUCTION_PATHS = ['server/', 'src/', 'app/', 'lib/', 'api/', 'web/'];
const SCANNABLE_EXTENSIONS = new Set([
    '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.html', '.vue', '.svelte',
    '.json', '.md', '.yaml', '.yml', '.toml', '.txt'
]);
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'coverage', 'dist', 'build', 'archive',
    '.simplebeacon', 'tests', 'test', '__tests__', 'fixtures', 'examples'
]);
const MAX_SCAN_BYTES = 512000;

const DOCUMENTATION_MARKERS = [
    { id: 'model-card', pattern: /model[-_\s]?card/i, label: 'Model card' },
    { id: 'technical-documentation', pattern: /technical[-_\s]?documentation|ai[-_\s]?system[-_\s]?documentation/i, label: 'Technical documentation' },
    { id: 'risk-assessment', pattern: /risk[-_\s]?assessment|fundamental[-_\s]?rights[-_\s]?impact/i, label: 'Risk assessment / FRIA' },
    { id: 'conformity-declaration', pattern: /conformity[-_\s]?declaration|eu[-_\s]?declaration[-_\s]?of[-_\s]?conformity/i, label: 'Conformity declaration' },
    { id: 'eu-ai-act', pattern: /eu[-_\s]?ai[-_\s]?act|regulation\s*\(\s*eu\s*\)\s*2024\/1689/i, label: 'EU AI Act reference' }
];

const DOCUMENTATION_FILE_NAMES = [
    'model-card.md',
    'MODEL_CARD.md',
    'ai-system-documentation.md',
    'risk-assessment.md',
    'conformity-declaration.md',
    'eu-ai-act-compliance.md'
];

const HIGH_RISK_CATALOG = [
    {
        id: 'EUAI-HR-001',
        annex: 'III.4',
        category: 'high-risk',
        type: 'EU AI Act — High-Risk Indicator',
        regex: /\b(?:resume|curriculum\s+vitae|cv)\s*(?:screen|scor|rank|filter|match)|(?:candidate|applicant)\s*(?:scor|rank|filter|screen)|(?:hiring|recruitment|employment)\s*(?:decision|ai|model|automated)/gi,
        severity: 'high',
        description: 'Employment or recruitment AI decision pattern (Annex III area)'
    },
    {
        id: 'EUAI-HR-002',
        annex: 'III.5',
        category: 'high-risk',
        type: 'EU AI Act — High-Risk Indicator',
        regex: /\b(?:credit\s*score|creditworthiness|loan\s*approv|lending\s*decision|underwriting\s*model|default\s*risk\s*model)/gi,
        severity: 'high',
        description: 'Credit or lending AI decision pattern (Annex III area)'
    },
    {
        id: 'EUAI-HR-003',
        annex: 'III.1',
        category: 'high-risk',
        type: 'EU AI Act — High-Risk Indicator',
        regex: /\b(?:biometric\s*identif|facial\s*recognition|face\s*match|emotion\s*detect|gait\s*recognition)/gi,
        severity: 'high',
        description: 'Biometric identification or categorisation pattern (Annex III area)'
    },
    {
        id: 'EUAI-HR-004',
        annex: 'III.3',
        category: 'high-risk',
        type: 'EU AI Act — High-Risk Indicator',
        regex: /\b(?:exam\s*grad|student\s*assessment\s*automated|admission\s*decision\s*ai|education\s*ai\s*score)/gi,
        severity: 'high',
        description: 'Education or vocational training AI assessment pattern (Annex III area)'
    },
    {
        id: 'EUAI-HR-005',
        annex: 'III.6',
        category: 'high-risk',
        type: 'EU AI Act — High-Risk Indicator',
        regex: /\b(?:insurance\s*premium\s*ai|insurance\s*underwriting\s*model|claims\s*automated\s*decision)/gi,
        severity: 'high',
        description: 'Insurance pricing or claims AI pattern (Annex III area)'
    },
    {
        id: 'EUAI-HR-006',
        annex: 'III.7',
        category: 'high-risk',
        type: 'EU AI Act — High-Risk Indicator',
        regex: /\b(?:predictive\s*policing|criminal\s*risk\s*score|recidivism\s*model|law\s*enforcement\s*ai)/gi,
        severity: 'high',
        description: 'Law enforcement risk assessment AI pattern (Annex III area)'
    },
    {
        id: 'EUAI-HR-007',
        annex: 'III.8',
        category: 'high-risk',
        type: 'EU AI Act — High-Risk Indicator',
        regex: /\b(?:migration\s*screen|asylum\s*decision\s*ai|border\s*control\s*ai|visa\s*automated\s*decision)/gi,
        severity: 'high',
        description: 'Migration, asylum, or border control AI pattern (Annex III area)'
    }
];

const AI_SYSTEM_INDICATORS = [
    {
        id: 'EUAI-AI-001',
        category: 'ai-system',
        type: 'EU AI Act — AI System Indicator',
        regex: /\b(?:openai|anthropic|claude|gpt-[\d.o]|chatgpt|llm\.|large\s*language\s*model|generative\s*ai|text-generation|chat\.completions|embeddings\.create)/gi,
        severity: 'medium',
        description: 'Generative AI or LLM integration detected'
    },
    {
        id: 'EUAI-AI-002',
        category: 'ai-system',
        type: 'EU AI Act — AI System Indicator',
        regex: /\b(?:machine\s*learning|ml\.predict|model\.predict|inference\s*endpoint|tensorflow|pytorch|onnxruntime|huggingface)/gi,
        severity: 'medium',
        description: 'Machine learning inference or model runtime detected'
    }
];

const TRANSPARENCY_DISCLOSURE_PATTERNS = [
    /\bai[-\s]?generated\b/i,
    /\bgenerated\s+by\s+(?:an?\s+)?ai\b/i,
    /\bartificial\s+intelligence\b/i,
    /\bthis\s+(?:content|response|output)\s+(?:was|is)\s+(?:automatically\s+)?generated\b/i,
    /\byou\s+are\s+(?:chatting|interacting)\s+with\s+(?:an?\s+)?ai\b/i,
    /\bautomated\s+(?:decision|recommendation)\b/i,
    /\beu\s+ai\s+act\b/i,
    /\barticle\s+50\b/i
];

const HUMAN_OVERSIGHT_PATTERNS = [
    /\bhuman[-\s]?(?:in[-\s]the[-\s]loop|oversight|review|approval)\b/i,
    /\bmanual\s+(?:review|approval|override|intervention)\b/i,
    /\boperator\s+override\b/i,
    /\bappeal\s+(?:process|mechanism|right)\b/i,
    /\bhuman\s+supervision\b/i
];

const LOGGING_PATTERNS = [
    /\b(?:audit|decision|inference|model)\s*log(?:ger|ging)?\b/i,
    /\bai\s*audit\b/i,
    /\btrace(?:Id|_id)\b/i,
    /\blog(?:Model|Inference|Decision)(?:Event|Record)?\b/i,
    /\brecord(?:AI|Model|Inference)Decision\b/i
];

function normalizeRel(baseDir, filePath) {
    return path.relative(baseDir, filePath).split(path.sep).join('/');
}

function lineNumberAt(content, index) {
    return content.slice(0, Math.max(0, index)).split('\n').length;
}

function isExcludedPath(relativePath) {
    const normalized = String(relativePath || '').replace(/\\/g, '/').toLowerCase();
    if (/(?:^|\/)src\/(?:rules|reporters|analyzers|proxy)(?:\/|$)/.test(normalized)) return true;
    if (/\/simplebeacon-cli\/src\/(?:rules|reporters|analyzers|proxy|lib)\//.test(normalized)) return true;
    return false;
}

async function walkSourceFiles(baseDir, sourcePaths, results = []) {
    for (const rel of sourcePaths) {
        const abs = path.join(baseDir, ...String(rel).replace(/\/$/, '').split('/'));
        if (!fs.existsSync(abs)) continue;
        const stat = await fs.promises.stat(abs).catch(() => null);
        if (!stat) continue;
        if (stat.isFile()) {
            const ext = path.extname(abs).toLowerCase();
            if (SCANNABLE_EXTENSIONS.has(ext)) {
                results.push({ path: abs, ext });
            }
            continue;
        }
        await walkDir(abs, results);
    }
    return results;
}

async function walkDir(dir, results, depth = 0) {
    if (depth > 8) return;
    let entries;
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await walkDir(fullPath, results, depth + 1);
            continue;
        }
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (SCANNABLE_EXTENSIONS.has(ext)) {
            results.push({ path: fullPath, ext });
        }
    }
}

function scanCatalogPatterns(relativePath, content, catalog, severityDefault) {
    const issues = [];
    for (const rule of catalog) {
        rule.regex.lastIndex = 0;
        let match;
        while ((match = rule.regex.exec(content)) !== null) {
            issues.push({
                id: `${rule.id}-${relativePath}-${match.index}`,
                severity: rule.severity || severityDefault,
                type: rule.type,
                filePath: relativePath,
                count: 1,
                description: rule.description,
                recommendedAction: rule.category === 'high-risk'
                    ? 'Document Annex III classification, conduct FRIA, and implement high-risk system requirements before August 2026'
                    : 'Review EU AI Act transparency and documentation obligations for this AI integration',
                affectedFiles: [relativePath],
                metadata: {
                    patternId: rule.id,
                    category: rule.category,
                    annex: rule.annex || null,
                    match: match[0].slice(0, 80)
                }
            });
        }
    }
    return issues;
}

function hasTransparencyDisclosure(content) {
    return TRANSPARENCY_DISCLOSURE_PATTERNS.some((pattern) => pattern.test(content));
}

function scanTransparencyGaps(relativePath, content, severityDefault) {
    const issues = [];
    const hasAiIndicator = AI_SYSTEM_INDICATORS.some((rule) => {
        rule.regex.lastIndex = 0;
        return rule.regex.test(content);
    });
    if (!hasAiIndicator) return issues;

    const isUiFacing = /\.(html|tsx|jsx|vue|svelte|md)$/i.test(relativePath)
        || /(?:component|page|view|ui|frontend|chat)/i.test(relativePath);
    if (!isUiFacing) return issues;

    if (!hasTransparencyDisclosure(content)) {
        issues.push({
            id: `EUAI-T50-001-${relativePath}`,
            severity: severityDefault,
            type: 'EU AI Act — Transparency Gap (Art. 50)',
            filePath: relativePath,
            count: 1,
            description: 'AI system integration in user-facing code without transparency/disclosure markers',
            recommendedAction: 'Add Article 50 disclosure — inform users they interact with AI or that content is AI-generated',
            affectedFiles: [relativePath],
            metadata: { patternId: 'EUAI-T50-001', category: 'transparency', article: '50' }
        });
    }
    return issues;
}

function scanHumanOversightGaps(relativePath, content, hasHighRiskInFile, severityDefault) {
    if (!hasHighRiskInFile) return [];
    if (HUMAN_OVERSIGHT_PATTERNS.some((pattern) => pattern.test(content))) return [];
    return [{
        id: `EUAI-HO-001-${relativePath}`,
        severity: severityDefault,
        type: 'EU AI Act — Human Oversight Gap',
        filePath: relativePath,
        count: 1,
        description: 'High-risk AI pattern without human oversight or appeal signals in same file',
        recommendedAction: 'Implement human-in-the-loop review, manual override, or appeal mechanism for high-risk AI decisions',
        affectedFiles: [relativePath],
        metadata: { patternId: 'EUAI-HO-001', category: 'human-oversight' }
    }];
}

function scanLoggingGaps(relativePath, content, hasAiInFile, severityDefault) {
    if (!hasAiInFile) return [];
    if (LOGGING_PATTERNS.some((pattern) => pattern.test(content))) return [];
    const isDecisionPath = /(?:route|controller|service|handler|api)/i.test(relativePath);
    if (!isDecisionPath) return [];
    return [{
        id: `EUAI-LOG-001-${relativePath}`,
        severity: 'low',
        type: 'EU AI Act — Logging Gap',
        filePath: relativePath,
        count: 1,
        description: 'AI decision path without audit or inference logging signals',
        recommendedAction: 'Add automatic logging of AI system inputs, outputs, and decision rationale for accountability',
        affectedFiles: [relativePath],
        metadata: { patternId: 'EUAI-LOG-001', category: 'logging' }
    }];
}

function detectDocumentationArtifacts(baseDir) {
    const found = [];
    const searchRoots = [
        baseDir,
        path.join(baseDir, 'docs'),
        path.join(baseDir, 'documentation'),
        path.join(baseDir, '.simplebeacon')
    ];

    for (const root of searchRoots) {
        if (!fs.existsSync(root)) continue;
        for (const fileName of DOCUMENTATION_FILE_NAMES) {
            const filePath = path.join(root, fileName);
            if (fs.existsSync(filePath)) {
                found.push({ id: 'file', label: fileName, path: normalizeRel(baseDir, filePath) });
            }
        }
        let entries;
        try {
            entries = fs.readdirSync(root, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const fullPath = path.join(root, entry.name);
            let content;
            try {
                if (fs.statSync(fullPath).size > MAX_SCAN_BYTES) continue;
                content = fs.readFileSync(fullPath, 'utf8');
            } catch {
                continue;
            }
            for (const marker of DOCUMENTATION_MARKERS) {
                if (marker.pattern.test(content) || marker.pattern.test(entry.name)) {
                    found.push({
                        id: marker.id,
                        label: marker.label,
                        path: normalizeRel(baseDir, fullPath)
                    });
                }
            }
        }
    }

    const unique = [];
    const seen = new Set();
    for (const item of found) {
        const key = `${item.id}:${item.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
    }
    return unique;
}

async function scanEuAiActPatterns(baseDir, options = {}) {
    const sourcePaths = options.sourcePaths || DEFAULT_SOURCE_PATHS;
    const productionPaths = options.productionPaths || DEFAULT_PRODUCTION_PATHS;
    const ignoreGlobs = options.ignoreGlobs || [];
    const severityDefault = options.severity || 'medium';

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

    const issues = [];
    let scanned = 0;
    let highRiskHits = 0;
    let aiSystemHits = 0;
    let transparencyGaps = 0;

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

        const highRiskIssues = scanCatalogPatterns(relativePath, content, HIGH_RISK_CATALOG, 'high');
        const aiIssues = scanCatalogPatterns(relativePath, content, AI_SYSTEM_INDICATORS, severityDefault);
        highRiskHits += highRiskIssues.length;
        aiSystemHits += aiIssues.length;
        issues.push(...highRiskIssues, ...aiIssues);

        const transparencyIssues = scanTransparencyGaps(relativePath, content, severityDefault);
        transparencyGaps += transparencyIssues.length;
        issues.push(...transparencyIssues);

        const hasHighRisk = highRiskIssues.length > 0;
        const hasAi = aiIssues.length > 0 || hasHighRisk;
        issues.push(...scanHumanOversightGaps(relativePath, content, hasHighRisk, severityDefault));
        issues.push(...scanLoggingGaps(relativePath, content, hasAi, severityDefault));
    }

    const documentationArtifacts = detectDocumentationArtifacts(baseDir);
    const summary = {
        highRiskIndicators: highRiskHits,
        aiSystemIndicators: aiSystemHits,
        transparencyGaps,
        documentationArtifacts: documentationArtifacts.length,
        documentationFound: documentationArtifacts.map((d) => d.path),
        deadlineNote: 'High-risk AI systems must comply with EU AI Act requirements by August 2026'
    };

    return {
        scanned,
        findings: issues.length,
        issues,
        summary,
        patterns: [...HIGH_RISK_CATALOG, ...AI_SYSTEM_INDICATORS].map((r) => r.id)
    };
}

module.exports = {
    HIGH_RISK_CATALOG,
    AI_SYSTEM_INDICATORS,
    DOCUMENTATION_MARKERS,
    DOCUMENTATION_FILE_NAMES,
    detectDocumentationArtifacts,
    scanEuAiActPatterns,
    hasTransparencyDisclosure,
    DEFAULT_SOURCE_PATHS,
    DEFAULT_PRODUCTION_PATHS
};
