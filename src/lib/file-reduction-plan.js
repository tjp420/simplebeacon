/**
 * Build actionable file reduction plans from scan reports.
 */

function isDirectoryArtifact(finding) {
    return finding.action === 'safe-to-delete'
        && (finding.kind === 'directory' || / directory$/i.test(String(finding.reason || '')));
}

function dedupeTopLevelDirectories(findings = []) {
    const normalized = findings
        .filter(isDirectoryArtifact)
        .map((finding) => ({
            ...finding,
            path: String(finding.path || '').replace(/\\/g, '/')
        }))
        .sort((left, right) => left.path.length - right.path.length);

    const roots = [];
    const deduped = [];
    for (const finding of normalized) {
        if (roots.some((root) => finding.path === root || finding.path.startsWith(`${root}/`))) {
            continue;
        }
        roots.push(finding.path);
        deduped.push(finding);
    }
    return deduped;
}

function groupDirectoriesByCategory(findings = []) {
    const grouped = new Map();
    for (const finding of findings) {
        if (!isDirectoryArtifact(finding)) continue;
        const key = finding.category || finding.reason?.replace(' directory', '') || 'other';
        const bucket = grouped.get(key) || { category: key, bytes: 0, files: 0, directories: 0, topPaths: [] };
        bucket.bytes += finding.sizeBytes || 0;
        bucket.files += finding.fileCount || 0;
        bucket.directories += 1;
        bucket.topPaths.push({
            path: finding.path,
            bytes: finding.sizeBytes || 0,
            files: finding.fileCount || 0
        });
        grouped.set(key, bucket);
    }

    return [...grouped.values()]
        .map((entry) => ({
            ...entry,
            topPaths: entry.topPaths.sort((a, b) => b.bytes - a.bytes).slice(0, 5)
        }))
        .sort((a, b) => b.bytes - a.bytes);
}

function buildFileReductionPlan(report) {
    const buildArtifacts = report.findings?.buildArtifacts || [];
    const duplicateAssets = report.findings?.assetConsolidation || [];
    const unusedFiles = report.findings?.unusedFiles || [];
    const buildSummary = report.scanners?.['build-artifacts'] || {};
    const assetSummary = report.scanners?.['asset-consolidation'] || {};
    const unusedSummary = report.scanners?.['unused-files'] || {};

    const safeDirectories = dedupeTopLevelDirectories(buildArtifacts)
        .sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
    const safeRoots = safeDirectories.map((finding) => String(finding.path || '').replace(/\\/g, '/'));

    const reviewFiles = buildArtifacts
        .filter((finding) => finding.action === 'review-before-delete')
        .filter((finding) => !safeRoots.some((root) => {
            const path = String(finding.path || '').replace(/\\/g, '/');
            return path === root || path.startsWith(`${root}/`);
        }))
        .sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));

    const reviewLogs = reviewFiles.filter((finding) => finding.category === 'logs');
    const reviewBinaries = reviewFiles.filter((finding) => finding.category === 'binaries');
    const reviewSourceMaps = reviewFiles.filter((finding) => finding.category === 'source-maps');

    const safeBytes = safeDirectories.reduce((sum, finding) => sum + (finding.sizeBytes || 0), 0);
    const reviewBytes = buildSummary.reviewBeforeDeleteBytes
        ?? reviewFiles.reduce((sum, finding) => sum + (finding.sizeBytes || 0), 0);
    const duplicateBytes = assetSummary.reclaimableBytes
        ?? duplicateAssets.reduce((sum, group) => sum + (group.reclaimableBytes || 0), 0);

    return {
        scopeNote: 'Directory totals exclude nested artifact paths to avoid double-counting reclaimable space.',
        totals: {
            reclaimableBytes: report.summary?.reclaimableBytes || buildSummary.reclaimableBytes || 0,
            safeToDeleteBytes: safeBytes,
            reviewBeforeDeleteBytes: reviewBytes,
            duplicateAssetBytes: duplicateBytes,
            estimatedImmediateSavingsBytes: safeBytes + duplicateBytes
        },
        safeToDelete: {
            bytes: safeBytes,
            directories: safeDirectories.length,
            files: safeDirectories.reduce((sum, finding) => sum + (finding.fileCount || 0), 0),
            topDirectories: safeDirectories.slice(0, 12).map((finding) => ({
                path: finding.path,
                bytes: finding.sizeBytes || 0,
                files: finding.fileCount || 0,
                category: finding.category || finding.reason
            })),
            byCategory: groupDirectoriesByCategory(safeDirectories)
        },
        reviewBeforeDelete: {
            bytes: reviewBytes,
            files: reviewFiles.length,
            logs: reviewLogs.slice(0, 10).map((finding) => ({
                path: finding.path,
                bytes: finding.sizeBytes || 0
            })),
            binaries: reviewBinaries.slice(0, 10).map((finding) => ({
                path: finding.path,
                bytes: finding.sizeBytes || 0
            })),
            sourceMaps: {
                files: reviewSourceMaps.length,
                bytes: reviewSourceMaps.reduce((sum, finding) => sum + (finding.sizeBytes || 0), 0)
            }
        },
        duplicateAssets: {
            groups: duplicateAssets.length,
            reclaimableBytes: duplicateBytes,
            topGroups: duplicateAssets
                .slice()
                .sort((a, b) => (b.reclaimableBytes || 0) - (a.reclaimableBytes || 0))
                .slice(0, 8)
                .map((group) => ({
                    keeper: group.keeper,
                    duplicates: group.duplicates || [],
                    reclaimableBytes: group.reclaimableBytes || 0
                }))
        },
        unusedFiles: {
            candidates: unusedFiles.length,
            sourceFilesScanned: unusedSummary.sourceFilesScanned || 0,
            entryPoints: unusedSummary.entryPoints || report.metadata?.entryPoints?.length || 0,
            note: 'Static analysis only — verify dynamic imports, runtime loaders, and config references before deleting.'
        },
        summaryTable: [
            {
                category: 'Build artifacts (safe)',
                files: safeDirectories.reduce((sum, finding) => sum + (finding.fileCount || 0), 0),
                bytes: safeBytes,
                action: 'Safe to delete'
            },
            {
                category: 'Build artifacts (review)',
                files: reviewFiles.length,
                bytes: reviewBytes,
                action: 'Review first'
            },
            {
                category: 'Duplicate assets',
                files: duplicateAssets.reduce((sum, group) => sum + (group.duplicates?.length || 0), 0),
                bytes: duplicateBytes,
                action: 'Consolidate'
            },
            {
                category: 'Unused source files',
                files: unusedFiles.length,
                bytes: null,
                action: 'Investigate'
            }
        ],
        recommendations: [
            'Delete top-level artifact directories first (`node_modules`, `coverage`, `__pycache__`) — highest confidence and largest savings.',
            'Regenerate dependencies with `npm install` after removing `node_modules`.',
            'Review log files before deletion — they may contain audit history.',
            'Consolidate duplicate assets by keeping the canonical copy and updating references.',
            'Treat unused file candidates as an investigation list, not a bulk delete list.'
        ]
    };
}

module.exports = {
    buildFileReductionPlan,
    groupDirectoriesByCategory,
    isDirectoryArtifact,
    dedupeTopLevelDirectories
};
