const { test } = require('node:test');
const assert = require('node:assert/strict');
const { enrichCompleteScan } = require('../src/lib/enrich-complete-scan');

test('compactDataCleanupReportForClient keeps plans but drops bulk finding arrays', () => {
    const { compactDataCleanupReportForClient } = require('../src/lib/enrich-cleanup-report');
    const bulky = {
        summary: { totalFindings: 15000, unusedFileCandidates: 14000 },
        fileReductionPlan: { totals: { safeToDeleteBytes: 1000 } },
        executiveSummary: { priorityActions: [{ title: 'Reclaim build artifact space' }] },
        findings: {
            unusedFiles: Array.from({ length: 14000 }, (_, i) => ({ path: `unused-${i}.js`, type: 'unused-file' }))
        },
        allFindings: Array.from({ length: 15000 }, (_, i) => ({ path: `f-${i}`, type: 'unused-file' }))
    };
    const compact = compactDataCleanupReportForClient(bulky);
    assert.equal(compact.compact, true);
    assert.equal(compact.findings.unusedFiles.length, 12);
    assert.equal(compact.allFindings.length, 24);
    assert.ok(JSON.stringify(compact).length < 20000);
    assert.equal(compact.fileReductionPlan.totals.safeToDeleteBytes, 1000);
});

test('enrichCompleteScan adds analysis and corrected summary fields', () => {
    const completeScan = {
        type: 'simplebeacon-complete-scan',
        version: '1.2.0',
        projectPath: 'C:\\Projects\\demo',
        summary: {
            fileReductionReclaimableBytes: 1000
        },
        results: {
            fileReduction: {
                projectRoot: 'C:\\Projects\\demo',
                scanProfile: 'file-reduction',
                summary: { totalFindings: 3, reclaimableBytes: 1000 },
                scanners: {
                    'build-artifacts': {
                        artifactDirectories: 1,
                        artifactFiles: 1,
                        reclaimableBytes: 1000,
                        safeToDeleteBytes: 900,
                        reviewBeforeDeleteBytes: 100
                    }
                },
                findings: {
                    buildArtifacts: [
                        {
                            kind: 'directory',
                            action: 'safe-to-delete',
                            reason: 'node_modules directory',
                            path: 'node_modules',
                            sizeBytes: 900,
                            fileCount: 2,
                            category: 'node_modules'
                        },
                        {
                            kind: 'file',
                            action: 'review-before-delete',
                            reason: 'Log file',
                            path: 'logs/audit.log',
                            sizeBytes: 100,
                            fileCount: 1,
                            category: 'logs'
                        }
                    ],
                    assetConsolidation: [],
                    unusedFiles: [],
                    configManagement: [],
                    dependencyHealth: [],
                    environmentVariables: [],
                    dataFreshness: [],
                    dataAccessPatterns: [],
                    dataPrivacy: [],
                    dataLineage: [],
                    dataConsistency: []
                }
            },
            dataQuality: {
                projectRoot: 'C:\\Projects\\demo',
                scanProfile: 'data-quality',
                summary: { totalFindings: 2, reclaimableBytes: 0 },
                scanners: {
                    'dependency-health': {
                        packageJsonFiles: 1,
                        unusedDependencies: 0,
                        versionDrift: 0
                    },
                    'data-privacy': {
                        credentialHits: 0,
                        piiHits: 1
                    }
                },
                findings: {
                    buildArtifacts: [],
                    assetConsolidation: [],
                    unusedFiles: [],
                    configManagement: [],
                    dependencyHealth: [],
                    environmentVariables: [],
                    dataFreshness: [],
                    dataAccessPatterns: [],
                    dataPrivacy: [
                        {
                            path: 'docs/MOCK_GUIDE.md',
                            reason: 'Possible realistic email in data file',
                            metadata: { line: 1, patternId: 'realistic-email' }
                        }
                    ],
                    dataLineage: [],
                    dataConsistency: []
                }
            }
        }
    };

    const enriched = enrichCompleteScan(completeScan);
    assert.equal(enriched.version, '1.3.0');
    assert.ok(enriched.results.fileReduction.fileReductionPlan);
    assert.ok(enriched.results.dataQuality.executiveSummary);
    assert.equal(enriched.summary.fileReductionSafeToDeleteBytes, 900);
    assert.ok(enriched.completeScanAnalysis.fileReduction.immediateSavingsBytes >= 900);
    assert.equal(enriched.completeScanAnalysis.dataQuality.piiNeedingReview, 0);
});
