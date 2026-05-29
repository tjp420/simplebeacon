/**
 * AI enhancement for audit report executive summary only.
 * Findings tables and detailed sections stay deterministic from scan JSON.
 */

const https = require('https');
const {
    collectIssues,
    resolveSeverityCounts,
    buildExecutiveSummaryMetricsTables,
    replaceExecutiveSummaryBody
} = require('./audit-report');

function normalizeRawIssue(issue) {
    return {
        severity: issue.severity || issue.severityBand || 'low',
        type: issue.type,
        filePath: issue.filePath || issue.file || issue.affectedFiles?.[0] || null,
        line: issue.line || issue.metadata?.line || null,
        description: issue.description,
        recommendedAction: issue.recommendedAction || issue.recommendation || null
    };
}

function buildEnhanceContext(report, assessment, options = {}) {
    const rawIssues = Array.isArray(report.rawIssues) ? report.rawIssues : [];
    const issues = collectIssues({ rawIssues });
    const severityCounts = resolveSeverityCounts(report, issues);
    const summary = assessment?.executiveSummary || {};
    const failedRules = (assessment?.complianceChecklist?.rules || [])
        .filter((rule) => rule.status === 'fail')
        .map((rule) => ({
            id: rule.id,
            title: rule.title,
            evidence: rule.evidence
        }));

    return {
        client: options.client || options.company || 'Client project',
        company: options.company || options.client || 'Client project',
        gateResult: summary.gateResult || (report.gate?.pass ? 'PASS' : 'FAIL'),
        complianceScore: summary.complianceScore ?? null,
        complianceReady: summary.complianceReady ?? null,
        deterministicHeadline: summary.headline || null,
        severityCounts,
        totalFiles: summary.filesScanned ?? report.totalFiles ?? report.filesAnalyzed ?? 0,
        rawIssues: rawIssues.slice(0, 24).map(normalizeRawIssue),
        failedRules,
        recommendedActions: (assessment?.recommendedActions?.immediate || []).slice(0, 6)
    };
}

function buildEnhancePrompt(context) {
    return `You are a professional security auditor writing the executive summary for a pre-launch repo audit sold to a dev agency owner.

Rewrite ONLY the narrative portions of the executive summary using the structured facts below.
Do NOT invent findings, file paths, severities, or counts.
Do NOT change numeric metrics — they will be inserted verbatim after your text.
Prioritize business impact: client handoff risk, reputation, credential exposure, mock data in production paths.

Return strict JSON only (no markdown fences):
{
  "intro": "2-3 sentences, professional business language",
  "businessImpact": "1 short paragraph on what matters before go-live",
  "headline": "One sentence fix-first priority headline"
}

FACTS:
${JSON.stringify(context, null, 2)}`;
}

function parseEnhanceResponse(raw) {
    const trimmed = String(raw || '').trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('AI response did not contain JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.intro || !parsed.headline) {
        throw new Error('AI response missing intro or headline');
    }

    return {
        intro: String(parsed.intro).trim(),
        businessImpact: parsed.businessImpact ? String(parsed.businessImpact).trim() : '',
        headline: String(parsed.headline).trim()
    };
}

function assembleEnhancedExecutiveSummary(parts, report, options = {}) {
    const metrics = buildExecutiveSummaryMetricsTables(report, options);
    const impactBlock = parts.businessImpact
        ? `${parts.businessImpact}\n\n`
        : '';

    return `${parts.intro}

${metrics}

${impactBlock}**Headline:** ${parts.headline}`;
}

function callOpenAIChatCompletion(prompt, options = {}) {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required for --enhance');
    }

    const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const body = JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: 'You rewrite audit executive summaries for agency owners. Output JSON only. Never invent security findings.'
            },
            { role: 'user', content: prompt }
        ]
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`OpenAI API ${res.statusCode}: ${raw.slice(0, 300)}`));
                    return;
                }

                try {
                    const payload = JSON.parse(raw);
                    const content = payload.choices?.[0]?.message?.content;
                    if (!content) {
                        reject(new Error('OpenAI API returned no message content'));
                        return;
                    }
                    resolve(content);
                } catch (error) {
                    reject(new Error(`OpenAI API parse error: ${error.message}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function enhanceExecutiveSummary(markdown, report, assessment, options = {}) {
    const context = buildEnhanceContext(report, assessment, options);
    const prompt = buildEnhancePrompt(context);
    const callAI = options.callAI || callOpenAIChatCompletion;
    const raw = await callAI(prompt, options);
    const parts = parseEnhanceResponse(raw);
    const newBody = assembleEnhancedExecutiveSummary(parts, report, options);
    return replaceExecutiveSummaryBody(markdown, newBody);
}

module.exports = {
    buildEnhanceContext,
    buildEnhancePrompt,
    parseEnhanceResponse,
    assembleEnhancedExecutiveSummary,
    enhanceExecutiveSummary,
    callOpenAIChatCompletion
};
