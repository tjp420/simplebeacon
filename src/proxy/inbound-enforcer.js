const fs = require('fs');
const path = require('path');
const { validateAgainstSpec, PAGE_SAMPLE_SPECS } = require('../lib/mock-data-schema-validator');
const { buildPatternsFromBaseline, scanFileContent } = require('../rules/fiction-kpi-patterns');

const INBOUND_VIRTUAL_PATH = 'proxy/inbound-response.txt';
const DEFAULT_BASELINE = {
    rejectedFiction: {
        completionRates: ['62', '75', '98.5'],
        aiConfidenceScores: ['94.3', '96.2'],
        featureCounts: ['47', '8'],
        openIssueCounts: ['156']
    }
};

function hasRejectedFictionEntries(rejectedFiction = {}) {
    return Object.values(rejectedFiction).some((values) => Array.isArray(values) && values.length > 0);
}

function mergeRejectedFiction(rejectedFiction = {}) {
    const merged = { ...DEFAULT_BASELINE.rejectedFiction };
    for (const [key, values] of Object.entries(rejectedFiction)) {
        if (Array.isArray(values) && values.length > 0) {
            merged[key] = values;
        }
    }
    return merged;
}

function loadBaseline(projectRoot) {
    const baselinePath = path.join(path.resolve(projectRoot || process.cwd()), '.simplebeacon', 'baseline.json');
    if (!fs.existsSync(baselinePath)) return DEFAULT_BASELINE;
    try {
        const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
        if (hasRejectedFictionEntries(parsed.rejectedFiction)) {
            return parsed;
        }
        return {
            ...parsed,
            rejectedFiction: mergeRejectedFiction(parsed.rejectedFiction)
        };
    } catch {
        return DEFAULT_BASELINE;
    }
}

function extractAssistantText(responseBody) {
    if (!responseBody) return '';

    try {
        const payload = JSON.parse(responseBody);
        const choice = payload.choices?.[0];
        if (typeof choice?.message?.content === 'string') return choice.message.content;
        if (typeof choice?.text === 'string') return choice.text;
        if (typeof payload.content?.[0]?.text === 'string') return payload.content[0].text;
        if (Array.isArray(payload.content)) {
            return payload.content.map((block) => block.text || '').join('\n');
        }
        if (typeof payload.output_text === 'string') return payload.output_text;
    } catch {
        /* fall through */
    }

    return responseBody;
}

function extractJsonCandidates(text) {
    const candidates = [];
    const fenced = text.match(/```json\s*([\s\S]*?)```/gi) || [];
    for (const block of fenced) {
        const inner = block.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        if (inner) candidates.push(inner);
    }

    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) candidates.push(braceMatch[0]);

    return candidates;
}

function runSchemaChecks(text) {
    const violations = [];
    for (const raw of extractJsonCandidates(text)) {
        let payload;
        try {
            payload = JSON.parse(raw);
        } catch {
            continue;
        }

        for (const [fileName, spec] of Object.entries(PAGE_SAMPLE_SPECS)) {
            if (!spec) continue;
            if (payload.type && spec.type && payload.type === spec.type) {
                const result = validateAgainstSpec(spec, payload);
                if (!result.valid) {
                    violations.push({
                        kind: 'schema',
                        fileName,
                        messages: result.violations.map((v) => v.message)
                    });
                }
            }
        }
    }
    return violations;
}

function runFictionChecks(text, projectRoot) {
    const baseline = loadBaseline(projectRoot);
    const patterns = buildPatternsFromBaseline(baseline);
    if (!patterns.length) return [];
    return scanFileContent(INBOUND_VIRTUAL_PATH, text, patterns, '.txt');
}

function buildSafeFallback(originalBody, violations) {
    const summary = violations.slice(0, 5).map((v) => {
        if (v.kind === 'schema') return `Schema drift (${v.fileName}): ${v.messages.join('; ')}`;
        return v.description || v.pattern || v.kind;
    }).join(' | ');

    const safeContent = [
        'Simplebeacon Proxy blocked or reformatted this response because generated content failed local layout checks.',
        summary ? `Findings: ${summary}` : 'Findings: fiction KPI or schema consistency mismatch.',
        'Regenerate with repository-audit baseline values and registered page-spec keys only.'
    ].join('\n\n');

    try {
        const parsed = JSON.parse(originalBody);
        if (Array.isArray(parsed.choices)) {
            return JSON.stringify({
                ...parsed,
                id: parsed.id || 'simplebeacon-proxy-fallback',
                choices: [{
                    index: 0,
                    message: { role: 'assistant', content: safeContent },
                    finish_reason: 'stop'
                }]
            });
        }
        if (parsed.type === 'message' || parsed.role) {
            return JSON.stringify({
                ...parsed,
                content: [{ type: 'text', text: safeContent }]
            });
        }
    } catch {
        /* fall through */
    }

    return JSON.stringify({
        object: 'simplebeacon.proxy.fallback',
        error: false,
        message: safeContent,
        violations: violations.slice(0, 10)
    });
}

function enforceInboundResponse(responseBody, options = {}) {
    const text = extractAssistantText(responseBody);
    const schemaViolations = runSchemaChecks(text);
    const fictionFindings = runFictionChecks(text, options.projectRoot);

    const violations = [
        ...schemaViolations,
        ...fictionFindings.map((f) => ({ kind: 'fiction', ...f }))
    ];

    const blocked = schemaViolations.length > 0
        || fictionFindings.some((f) => f.severity === 'high' || f.severity === 'medium');

    if (!blocked) {
        return { modified: false, body: responseBody, violations: [] };
    }

    return {
        modified: true,
        body: buildSafeFallback(responseBody, violations),
        violations
    };
}

module.exports = {
    enforceInboundResponse,
    extractAssistantText,
    loadBaseline,
    buildSafeFallback
};
