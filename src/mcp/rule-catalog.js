/**
 * Deterministic rule metadata for explain_finding MCP tool.
 */

const { RULE_CATALOG } = require('../rules/llm-slop-patterns');
const { LEAK_PATTERNS } = require('../rules/production-leak');

const PRODUCTION_LEAK_SUMMARIES = {
    'sample-json': 'String literal references a *-sample.json fixture path',
    'web-data-sample': 'String literal references web/data sample fixture path',
    'mock-path': 'String literal references a mock/ directory path',
    'fixtures-path': 'String literal references a fixtures/ directory path',
    'template-sample': 'String literal references template sample data',
    'plain-sample-json': 'String literal references sample.json (non hyphenated)'
};

const CREDENTIAL_RULES = [
    {
        id: 'aws-access-key',
        category: 'credentials',
        summary: 'AWS access key pattern (AKIA…)',
        tuning: 'Rotate key, use IAM roles or secrets manager; never commit keys'
    },
    {
        id: 'openai-key',
        category: 'credentials',
        summary: 'OpenAI-style API key (sk-…)',
        tuning: 'Revoke key, load from environment or vault'
    },
    {
        id: 'jwt-token',
        category: 'credentials',
        summary: 'JWT-shaped token in source',
        tuning: 'Remove token; use short-lived tokens from auth service'
    }
];

const FICTION_RULE_PREFIX = 'completion-rate-';

function explainFinding(patternId, options = {}) {
    const id = String(patternId || '').trim();
    if (!id) {
        return { found: false, error: 'patternId is required' };
    }

    const llmRule = RULE_CATALOG.find((r) => r.id === id);
    if (llmRule) {
        return {
            found: true,
            patternId: id,
            category: 'llm-slop',
            severity: llmRule.severity,
            summary: llmRule.description,
            deterministic: true,
            usesLlm: false,
            tuning: 'Replace placeholder copy before merge; not semantic AI review'
        };
    }

    const leakPattern = LEAK_PATTERNS.find((r) => r.id === id);
    if (leakPattern) {
        return {
            found: true,
            patternId: id,
            category: 'production-leak',
            severity: 'critical',
            summary: PRODUCTION_LEAK_SUMMARIES[id] || `Production leak pattern (${id})`,
            tuning: id === 'sample-json' || id === 'web-data-sample'
                ? 'Use runtime API/env config; keep *-sample.json under tests or web/data for gate scans only'
                : 'Move mock/fixture paths to test scope or dev-only routes',
            deterministic: true,
            usesLlm: false
        };
    }

    const cred = CREDENTIAL_RULES.find((r) => id.includes(r.id) || id === r.id);
    if (cred) {
        return { found: true, patternId: id, ...cred, severity: 'high', deterministic: true, usesLlm: false };
    }

    if (id.startsWith(FICTION_RULE_PREFIX) || id.startsWith('source-fiction-')) {
        return {
            found: true,
            patternId: id,
            category: 'fiction-kpi',
            severity: 'medium',
            summary: 'Hardcoded metric matches a rejected fiction value in baseline.json',
            tuning: 'Use measured KPIs from audit baseline or move metrics to sample JSON only',
            deterministic: true,
            usesLlm: false
        };
    }

    if (options.type) {
        return {
            found: true,
            patternId: id,
            category: String(options.type),
            summary: `Rule ${id} — regex match from Simplebeacon scan engine`,
            tuning: 'See packages/simplebeacon-cli/src/rules/ and .simplebeacon/config.json allowlists',
            deterministic: true,
            usesLlm: false
        };
    }

    return {
        found: false,
        patternId: id,
        hint: 'Pass type from scan_snippet result, or inspect src/rules/ in the CLI package'
    };
}

module.exports = {
    explainFinding,
    RULE_CATALOG,
    LEAK_PATTERNS
};
