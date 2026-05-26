/**
 * Structural specs for data/roadmap/*.json files (not PAGE_SAMPLE_SPECS).
 */

const fs = require('fs');
const path = require('path');
const { validateAgainstSpec } = require('./mock-data-schema-validator');

const ROADMAP_JSON_SPECS = {
    'gguf-roadmap-data.json': {
        type: 'gguf-development-roadmap-report',
        topLevelKeys: ['projectOverview', 'developmentPhases', 'dataSource'],
        arrayKeys: ['developmentPhases'],
        requireRepositoryAudit: true
    },
    'ai-roadmap-report.json': {
        type: 'ai-roadmap-report-model',
        topLevelKeys: ['projectOverview', 'developmentPhases', 'dataSource'],
        arrayKeys: ['developmentPhases'],
        requireRepositoryAudit: true
    },
    'ai-roadmap-data.json': {
        type: 'ai-powered-roadmap-report',
        topLevelKeys: ['projectOverview', 'developmentPhases'],
        arrayKeys: ['developmentPhases'],
        legacyFiction: true,
        archived: true,
        relativePath: 'archive/ai-roadmap-data.json'
    },
    'cascade-project-roadmap.json': {
        type: 'dynamic-project-roadmap-analysis',
        topLevelKeys: ['executiveSummary', 'developmentPhases'],
        arrayKeys: ['developmentPhases'],
        legacyFiction: true,
        archived: true,
        maxBytes: 512000,
        relativePath: 'archive/cascade-project-roadmap.json'
    }
};

const ROADMAP_DIR = 'data/roadmap';

function validateRoadmapJson(fileName, payload, baseline) {
    const spec = ROADMAP_JSON_SPECS[fileName];
    if (!spec || !payload || typeof payload !== 'object') {
        return { valid: true, violations: [] };
    }

    const structural = validateAgainstSpec(spec, payload);
    const violations = [...(structural.violations || [])];

    if (spec.requireRepositoryAudit && baseline?.dataSource && payload.dataSource !== baseline.dataSource) {
        violations.push({
            kind: 'data-source',
            message: `Expected dataSource "${baseline.dataSource}", got "${payload.dataSource || 'none'}"`
        });
    }

    if (spec.legacyFiction) {
        violations.push({
            kind: 'legacy-fiction',
            message: 'Legacy roadmap file — prefer gguf-roadmap-data.json / ai-roadmap-report.json baselines'
        });
    }

    return {
        valid: violations.length === 0,
        violations,
        missingFields: violations
            .filter((v) => v.kind.startsWith('missing'))
            .map((v) => v.message)
    };
}

async function validateRoadmapFiles(baseDir, options = {}) {
    const baseline = options.baseline || {};
    const roadmapDir = path.join(baseDir, ROADMAP_DIR);
    if (!fs.existsSync(roadmapDir)) {
        return { checked: 0, passed: 0, issues: [] };
    }

    const issues = [];
    let checked = 0;
    let passed = 0;

    for (const [fileName, spec] of Object.entries(ROADMAP_JSON_SPECS)) {
        if (spec.archived) {
            continue;
        }

        const filePath = path.join(roadmapDir, spec.relativePath || fileName);
        if (!fs.existsSync(filePath)) {
            issues.push({
                id: `roadmap-missing-${fileName}`,
                severity: 'medium',
                type: 'Missing Roadmap File',
                filePath,
                count: 1,
                description: `${fileName}: not found under ${ROADMAP_DIR}`,
                recommendedAction: 'Restore roadmap JSON or remove spec entry',
                affectedFiles: [fileName]
            });
            continue;
        }

        let stat;
        try {
            stat = await fs.promises.stat(filePath);
        } catch {
            continue;
        }

        if (spec.maxBytes && stat.size > spec.maxBytes) {
            issues.push({
                id: `roadmap-oversized-${fileName}`,
                severity: 'low',
                type: 'Oversized Roadmap File',
                filePath,
                count: 1,
                description: `${fileName}: ${stat.size} bytes exceeds ${spec.maxBytes} — legacy export`,
                recommendedAction: 'Replace with measured baseline or archive outside scan paths',
                affectedFiles: [fileName],
                metadata: { sizeBytes: stat.size, maxBytes: spec.maxBytes }
            });
            checked += 1;
            continue;
        }

        let payload;
        try {
            payload = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
        } catch (error) {
            issues.push({
                id: `roadmap-invalid-${fileName}`,
                severity: 'high',
                type: 'Invalid JSON',
                filePath,
                count: 1,
                description: `${fileName}: ${error.message}`,
                recommendedAction: 'Fix JSON syntax in roadmap data file',
                affectedFiles: [fileName]
            });
            checked += 1;
            continue;
        }

        checked += 1;
        const result = validateRoadmapJson(fileName, payload, baseline);
        if (result.valid) {
            passed += 1;
        } else {
            const severity = result.violations.some((v) => v.kind === 'legacy-fiction') ? 'medium' : 'high';
            issues.push({
                id: `roadmap-schema-${fileName}`,
                severity,
                type: severity === 'medium' ? 'Legacy Fiction Roadmap' : 'Roadmap Schema Violation',
                filePath,
                count: result.violations.length,
                description: `${fileName}: ${result.violations.map((v) => v.message).join('; ')}`,
                recommendedAction: severity === 'medium'
                    ? 'Use repository-audit roadmap files; keep legacy exports out of active API paths'
                    : 'Update roadmap JSON to conform to measured baseline schema',
                affectedFiles: [fileName],
                metadata: { violations: result.violations }
            });
        }
    }

    return { checked, passed, issues };
}

module.exports = {
    ROADMAP_JSON_SPECS,
    ROADMAP_DIR,
    validateRoadmapJson,
    validateRoadmapFiles
};
