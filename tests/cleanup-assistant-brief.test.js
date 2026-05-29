const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCleanupAssistantBrief, resolveFileReductionPlan } = require('../src/lib/cleanup-assistant-brief');

test('resolveFileReductionPlan synthesizes tiers from compact scanner summaries', () => {
    const compactScan = {
        summary: { unusedFileCandidates: 120, reclaimableBytes: 5000 },
        scanners: {
            'build-artifacts': {
                safeToDeleteBytes: 4000,
                reviewBeforeDeleteBytes: 500
            },
            'unused-files': { unusedCandidates: 120 }
        },
        findings: {
            buildArtifacts: [
                {
                    path: 'coverage',
                    action: 'safe-to-delete',
                    kind: 'directory',
                    reason: 'coverage directory',
                    sizeBytes: 4000,
                    fileCount: 20,
                    category: 'coverage'
                }
            ],
            assetConsolidation: []
        }
    };

    const plan = resolveFileReductionPlan(compactScan);
    assert.equal(plan.totals.safeToDeleteBytes, 4000);
    assert.equal(plan.safeToDelete.topDirectories.length, 1);
    assert.equal(plan.unusedFiles.candidates, 120);

    const brief = buildCleanupAssistantBrief({
        projectPath: 'C:\\Projects\\demo',
        fileReduction: compactScan,
        dataQuality: { executiveSummary: { priorityActions: [{ title: 'Fix env keys', detail: '3 missing' }] } },
        repositoryInventory: { totalFiles: 1000, totalFolders: 100 }
    });

    assert.ok(brief.scanAnalysis.fileReduction);
    assert.equal(brief.estimatedReduction.files, 20);
    assert.equal(brief.tiers.investigate.files, 120);
    assert.equal(brief.projectedInventory.totalFiles, 980);
});

test('buildCleanupAssistantBrief stays empty when no scan signals exist', () => {
    const brief = buildCleanupAssistantBrief({
        projectPath: 'C:\\Projects\\demo',
        fileReduction: null,
        dataQuality: null,
        repositoryInventory: { totalFiles: 42224, totalFolders: 5199 }
    });

    assert.equal(brief.estimatedReduction.files, 0);
    assert.equal(brief.scanAnalysis.fileReduction, null);
    assert.equal(brief.scanAnalysis.dataQuality, null);
});
