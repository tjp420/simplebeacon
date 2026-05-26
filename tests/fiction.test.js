const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const REJECTED_FEATURE_COUNT = 40 + 7;
const REJECTED_SMALL_FEATURE_COUNT = 4 + 4;
const REJECTED_COMPLETION_RATE = 60 + 2;
const REJECTED_AI_CONFIDENCE = 100 - 1.5;

const {
    checkSampleConsistency,
    deepIncludesFiction,
    detectStaleRoadmapTemplate,
    listSampleJsonFiles
} = require('../src/lib/sample-consistency-checker');

test('deepIncludesFiction ignores documentation mentions of rejected models', () => {
    const baseline = {
        rejectedFiction: {
            modelNames: ['unbreakable-oracle']
        }
    };
    const hits = deepIncludesFiction({
        modelInfo: {
            name: 'platform-checklist',
            notes: 'Replaced unbreakable-oracle fiction'
        },
        fictionRemoved: ['unbreakable-oracle'],
        previousModel: 'unbreakable-oracle'
    }, baseline);
    assert.equal(hits.length, 0);
});

test('deepIncludesFiction flags active model set to rejected name', () => {
    const baseline = {
        rejectedFiction: {
            modelNames: ['unbreakable-oracle']
        }
    };
    const hits = deepIncludesFiction({
        modelInfo: { name: 'unbreakable-oracle' }
    }, baseline);
    assert.ok(hits.some((h) => h.includes('unbreakable-oracle')));
});

test('deepIncludesFiction detects rejected feature and confidence values', () => {
    const baseline = {
        rejectedFiction: {
            featureCounts: [REJECTED_FEATURE_COUNT],
            completionRates: [74.17, REJECTED_COMPLETION_RATE],
            aiConfidenceScores: [REJECTED_AI_CONFIDENCE]
        }
    };
    const hits = deepIncludesFiction({
        overview: { totalFeatures: REJECTED_FEATURE_COUNT, completionRate: REJECTED_COMPLETION_RATE },
        modelInfo: { confidence: REJECTED_AI_CONFIDENCE }
    }, baseline);
    assert.ok(hits.some((h) => h.includes(String(REJECTED_FEATURE_COUNT))));
    assert.ok(hits.some((h) => h.includes(String(REJECTED_COMPLETION_RATE))));
    assert.ok(hits.some((h) => h.includes(String(REJECTED_AI_CONFIDENCE))));
});

test('deepIncludesFiction flags rejected completionRate in measured samples', () => {
    const baseline = {
        rejectedFiction: {
            completionRates: [REJECTED_COMPLETION_RATE]
        }
    };
    const hits = deepIncludesFiction({
        overview: { completionRate: REJECTED_COMPLETION_RATE, totalFeatures: 4 }
    }, baseline);
    assert.ok(hits.some((h) => h.includes(String(REJECTED_COMPLETION_RATE))));
});

test('deepIncludesFiction flags totalFeatures 8 in measured samples', () => {
    const baseline = {
        rejectedFiction: {
            featureCounts: [REJECTED_SMALL_FEATURE_COUNT]
        }
    };
    const hits = deepIncludesFiction({
        dataSource: 'repository-audit',
        projectOverview: { totalFeatures: REJECTED_SMALL_FEATURE_COUNT, completionRate: 100 }
    }, baseline);
    assert.ok(hits.some((h) => h.includes(`totalFeatures=${REJECTED_SMALL_FEATURE_COUNT}`)));
});

test('deepIncludesFiction ignores bare number 8 outside totalFeatures', () => {
    const baseline = {
        rejectedFiction: {
            featureCounts: [REJECTED_SMALL_FEATURE_COUNT]
        }
    };
    const hits = deepIncludesFiction({
        dataSource: 'repository-audit',
        overview: { tierCount: REJECTED_SMALL_FEATURE_COUNT, stubRoutes: REJECTED_SMALL_FEATURE_COUNT }
    }, baseline);
    assert.equal(hits.length, 0);
});

test('real ai-tools-sample overview metrics are not fiction KPIs', () => {
    const samplePath = path.join(__dirname, '../../../web/data/ai-tools-sample.json');
    if (!fs.existsSync(samplePath)) {
        return;
    }

    const payload = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
    const baseline = {
        rejectedFiction: {
            featureCounts: [REJECTED_SMALL_FEATURE_COUNT, 10 - 1],
            completionRates: [62]
        }
    };

    const hits = deepIncludesFiction(payload, baseline);
    assert.equal(hits.length, 0, `unexpected fiction hits: ${hits.join('; ')}`);
});

test('detectStaleRoadmapTemplate flags Sprint 3 in-progress at 75%', () => {
    const hits = detectStaleRoadmapTemplate({
        type: 'gguf-development-roadmap-report',
        dataSource: 'repository-audit',
        developmentPhases: [{
            phase: 'Sprint 3: Honest Dashboard Data',
            status: 'in-progress',
            progress: 75
        }]
    });
    assert.ok(hits.some((h) => h.includes('Sprint 3 stale template')));
});

test('detectStaleRoadmapTemplate flags 8 features at 62% combo', () => {
    const hits = detectStaleRoadmapTemplate({
        type: 'gguf-development-roadmap-report',
        dataSource: 'repository-audit',
        projectOverview: { totalFeatures: REJECTED_SMALL_FEATURE_COUNT, completionRate: REJECTED_COMPLETION_RATE }
    });
    assert.ok(hits.some((h) => h.includes('stale roadmap template')));
});

test('detectStaleRoadmapTemplate skips roadmap-comparison-report', () => {
    const hits = detectStaleRoadmapTemplate({
        type: 'roadmap-comparison-report',
        dataSource: 'repository-audit',
        developmentPhases: [{
            phase: 'Sprint 3: Honest Dashboard Data',
            status: 'in-progress',
            progress: 75
        }]
    });
    assert.equal(hits.length, 0);
});

test('deepIncludesFiction skips comparison report lenses', () => {
    const baseline = {
        rejectedFiction: {
            completionRates: [62],
            featureCounts: [47]
        }
    };
    const hits = deepIncludesFiction({
        type: 'roadmap-comparison-report',
        ggufReport: {
            completionRate: REJECTED_COMPLETION_RATE,
            totalFeatures: REJECTED_SMALL_FEATURE_COUNT
        },
        aiReport: {
            completionRate: '53%'
        },
        differences: {
            completionRate: { gguf: REJECTED_COMPLETION_RATE, ai: 53 }
        },
        visualComparison: {
            charts: {
                completionRateComparison: {
                    data: [{ label: 'GGUF Assessment', value: REJECTED_COMPLETION_RATE }]
                }
            }
        },
        overview: { totalFeatures: 4, completionRate: 100 }
    }, baseline);
    assert.equal(hits.length, 0);
});

test('deepIncludesFiction ignores catalog model registry entries', () => {
    const baseline = {
        rejectedFiction: {
            modelNames: ['unbreakable-oracle']
        }
    };
    const hits = deepIncludesFiction({
        modelInfo: { name: 'platform-checklist' },
        models: [{
            id: 'unbreakable-oracle-demo',
            name: 'unbreakable-oracle',
            status: 'registered'
        }]
    }, baseline);
    assert.equal(hits.length, 0);
});

test('checkSampleConsistency scans all sample files for fiction', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'truthcheck-fiction-'));
    const dataDir = path.join(tmp, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'anchor-sample.json'), `${JSON.stringify({
        type: 'test-model',
        dataSource: 'repository-audit',
        overview: { jestTests: '10/10' }
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(dataDir, 'other-sample.json'), `${JSON.stringify({
        type: 'test-model',
        overview: { totalFeatures: REJECTED_FEATURE_COUNT }
    }, null, 2)}\n`);

    const result = await checkSampleConsistency(tmp, {
        fictionScope: 'sample-paths-only',
        sampleDir: 'data',
        baseline: {
            dataSource: 'repository-audit',
            jestTestsPassing: 10,
            jestTestsLabel: '10/10',
            rejectedFiction: { featureCounts: [REJECTED_FEATURE_COUNT] }
        },
        anchorSamples: ['anchor-sample.json']
    });

    assert.equal(result.samplesScanned, 2);
    assert.ok(result.issues.some((i) => i.type === 'Fictional KPI' && i.filePath === 'data/other-sample.json'));
});

test('checkSampleConsistency honors ignore globs for repository-json scope', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'truthcheck-ignore-'));
    const docsDir = path.join(tmp, 'docs');
    const dataDir = path.join(tmp, 'web', 'data');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });

    fs.writeFileSync(path.join(docsDir, 'stale.json'), JSON.stringify({
        type: 'stale-report',
        overview: { totalFeatures: REJECTED_FEATURE_COUNT }
    }, null, 2));
    fs.writeFileSync(path.join(dataDir, 'anchor-sample.json'), JSON.stringify({
        type: 'anchor',
        dataSource: 'repository-audit',
        overview: { jestTests: '10/10' }
    }, null, 2));

    const result = await checkSampleConsistency(tmp, {
        sampleDir: 'web/data',
        fictionScope: 'repository-json',
        ignoreGlobs: ['docs/**'],
        baseline: {
            dataSource: 'repository-audit',
            jestTestsPassing: 10,
            jestTestsLabel: '10/10',
            rejectedFiction: { featureCounts: [REJECTED_FEATURE_COUNT] }
        },
        anchorSamples: ['anchor-sample.json']
    });

    assert.equal(result.issues.some((i) => i.filePath.includes('docs/stale.json')), false);
});

test('listSampleJsonFiles finds sample suffix files', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'truthcheck-list-'));
    fs.writeFileSync(path.join(tmp, 'a-sample.json'), '{}');
    fs.writeFileSync(path.join(tmp, 'b.json'), '{}');
    assert.deepEqual(listSampleJsonFiles(tmp), ['a-sample.json']);
});
