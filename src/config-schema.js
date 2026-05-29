/**
 * Validate .simplebeacon/config.json and return warnings/errors.
 */

const VALID_RULES = new Set([
    'credentials',
    'json-schema',
    'sample-consistency',
    'roadmap',
    'production-leak',
    'fiction-kpi-patterns',
    'llm-slop-patterns',
    'agency-handoff-patterns',
    'jest-baseline'
]);

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const VALID_PROFILES = new Set(['minimal', 'standard', 'cascade']);

function validateConfig(config) {
    const errors = [];
    const warnings = [];

    if (!config || typeof config !== 'object') {
        errors.push('Config must be a JSON object');
        return { valid: false, errors, warnings };
    }

    if (config.profile && !VALID_PROFILES.has(config.profile)) {
        warnings.push(`Unknown profile "${config.profile}" — use minimal, standard, or cascade`);
    }

    if (config.scanPaths != null && !Array.isArray(config.scanPaths)) {
        errors.push('scanPaths must be an array of relative paths');
    } else if (Array.isArray(config.scanPaths) && config.scanPaths.length === 0) {
        warnings.push('scanPaths is empty — scan will find no mock data files');
    } else if (Array.isArray(config.scanPaths)) {
        for (const scanPath of config.scanPaths) {
            if (typeof scanPath !== 'string' || !scanPath.trim()) {
                errors.push('scanPaths entries must be non-empty strings');
                continue;
            }
            if (/^(?:[A-Za-z]:[\\/]|\/)/.test(scanPath) || scanPath.includes('..')) {
                errors.push(`scanPaths entry must be repository-relative and non-traversing: "${scanPath}"`);
            }
        }
    }

    if (config.productionPaths != null && !Array.isArray(config.productionPaths)) {
        errors.push('productionPaths must be an array of relative paths');
    } else if (Array.isArray(config.productionPaths)) {
        for (const productionPath of config.productionPaths) {
            if (typeof productionPath !== 'string' || !productionPath.trim()) {
                errors.push('productionPaths entries must be non-empty strings');
                continue;
            }
            if (/^(?:[A-Za-z]:[\\/]|\/)/.test(productionPath) || productionPath.includes('..')) {
                errors.push(`productionPaths entry must be repository-relative and non-traversing: "${productionPath}"`);
            }
        }
    }

    if (config.rules && typeof config.rules === 'object') {
        for (const [name, rule] of Object.entries(config.rules)) {
            if (!VALID_RULES.has(name)) {
                warnings.push(`Unknown rule "${name}" — ignored`);
                continue;
            }
            if (rule && typeof rule === 'object' && rule.severity && !VALID_SEVERITIES.has(rule.severity)) {
                warnings.push(`Rule "${name}" has invalid severity "${rule.severity}"`);
            }
        }
    }

    if (config.gate?.failOn) {
        for (const sev of config.gate.failOn) {
            if (!VALID_SEVERITIES.has(sev)) {
                warnings.push(`gate.failOn contains invalid severity "${sev}"`);
            }
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

module.exports = {
    VALID_RULES,
    VALID_PROFILES,
    validateConfig
};
