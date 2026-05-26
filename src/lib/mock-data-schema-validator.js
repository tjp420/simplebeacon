/**
 * Validate dashboard sample JSON files against page model specs.
 */

const crypto = require('crypto');
const { PAGE_SAMPLE_SPECS } = require('./page-sample-specs');

function getNestedValue(payload, pathParts) {
    return pathParts.reduce((node, part) => node?.[part], payload);
}

function validateAgainstSpec(spec, payload) {
    if (!spec || !payload || typeof payload !== 'object') {
        return { valid: true, violations: [] };
    }

    const violations = [];

    if (spec.type && payload.type !== spec.type) {
        violations.push({
            kind: 'type-mismatch',
            message: `Expected type "${spec.type}", got "${payload.type || 'none'}"`
        });
    }

    for (const key of spec.topLevelKeys || []) {
        if (!(key in payload)) {
            violations.push({ kind: 'missing-key', message: `Missing top-level key: ${key}` });
        }
    }

    for (const check of spec.nestedChecks || []) {
        const value = getNestedValue(payload, check.path);
        if (value === undefined || value === null) {
            violations.push({
                kind: 'missing-nested',
                message: `Missing nested path: ${check.path.join('.')}`
            });
        }
    }

    if (spec.overviewKeys?.length) {
        if (!payload.overview) {
            violations.push({ kind: 'missing-overview', message: 'Missing overview object' });
        } else {
            for (const key of spec.overviewKeys) {
                if (!(key in payload.overview)) {
                    violations.push({ kind: 'missing-overview-key', message: `Missing overview.${key}` });
                }
            }
        }
    }

    for (const key of spec.arrayKeys || []) {
        if (!Array.isArray(payload[key])) {
            violations.push({ kind: 'invalid-array', message: `Expected array: ${key}` });
        } else if (payload[key].length === 0 && !(spec.allowEmptyArrays || []).includes(key)) {
            violations.push({ kind: 'empty-array', message: `Empty array: ${key}` });
        }
    }

    for (const key of spec.objectKeys || []) {
        if (!payload[key] || typeof payload[key] !== 'object' || Array.isArray(payload[key])) {
            violations.push({ kind: 'invalid-object', message: `Expected object: ${key}` });
        }
    }

    // Optional object sections may be omitted by newer samples while legacy
    // payloads still include them.
    for (const key of spec.optionalObjectKeys || []) {
        if (key in payload && (!payload[key] || typeof payload[key] !== 'object' || Array.isArray(payload[key]))) {
            violations.push({ kind: 'invalid-optional-object', message: `Expected object: ${key}` });
        }
    }

    return {
        valid: violations.length === 0,
        violations,
        missingFields: violations
            .filter((v) => v.kind.startsWith('missing'))
            .map((v) => v.message)
    };
}

function validateSampleSchema(fileName, payload) {
    const spec = PAGE_SAMPLE_SPECS[fileName];
    return validateAgainstSpec(spec, payload);
}

function hashFileContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function findDuplicateContentGroups(entries) {
    const groups = new Map();

    for (const entry of entries) {
        const existing = groups.get(entry.contentHash) || [];
        existing.push(entry);
        groups.set(entry.contentHash, existing);
    }

    return [...groups.values()].filter((group) => group.length > 1);
}

function strategyForIssueType(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized.includes('json') || normalized.includes('invalid json')) return 'json-syntax';
    if (normalized.includes('schema')) return 'schema-violation';
    if (normalized.includes('missing field')) return 'missing-fields';
    if (normalized.includes('duplicate')) return 'duplicate-data';
    if (normalized.includes('inconsist')) return 'schema-violation';
    if (normalized.includes('empty')) return 'json-syntax';
    return 'schema-violation';
}

module.exports = {
    PAGE_SAMPLE_SPECS,
    validateAgainstSpec,
    validateSampleSchema,
    hashFileContent,
    findDuplicateContentGroups,
    strategyForIssueType
};
