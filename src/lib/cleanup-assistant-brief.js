/**
 * Build tiered cleanup brief from file-reduction + data-quality scan results.
 */

const { buildCompleteScanAnalysis } = require('./enrich-complete-scan');

const DEFAULT_PROTECTED_PATHS = [
    'web/data',
    'data/mock',
    'data-central',
    'data/roadmap',
    'uploads',
    '.git'
];

const DEFAULT_POLICY = {
    protectedPaths: DEFAULT_PROTECTED_PATHS,
    allowNodeModules: true,
    allowSimplebeaconCache: false,
    aggressiveness: 'moderate'
};

function normalizePath(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function pathMatchesProtected(relativePath, protectedPaths = []) {
    const norm = normalizePath(relativePath);
    return protectedPaths.some((entry) => {
        const pat = normalizePath(entry);
        if (!pat) return false;
        return norm === pat || norm.startsWith(`${pat}/`) || norm.includes(`/${pat}/`);
    });
}

function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatCount(value) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return Number(value).toLocaleString();
}

function isSimplebeaconCachePath(relativePath) {
    return normalizePath(relativePath).includes('.simplebeacon/');
}

function isNodeModulesPath(relativePath) {
    const norm = normalizePath(relativePath);
    return norm === 'node_modules' || norm.endsWith('/node_modules') || norm.includes('/node_modules/');
}

function classifyDirectory(entry, policy) {
    const entryPath = entry.path || '';
    if (pathMatchesProtected(entryPath, policy.protectedPaths)) return 'protected';
    if (isSimplebeaconCachePath(entryPath) && !policy.allowSimplebeaconCache) return 'review';
    if (isNodeModulesPath(entryPath) && !policy.allowNodeModules) return 'review';
    return 'safe';
}

function isDirectoryArtifact(finding) {
    return finding?.action === 'safe-to-delete'
        && (finding.kind === 'directory' || / directory$/i.test(String(finding.reason || '')));
}

function resolveFileReductionPlan(fileReduction) {
    const existing = fileReduction?.fileReductionPlan;
    if (existing?.safeToDelete?.topDirectories?.length || existing?.totals?.safeToDeleteBytes) {
        return existing;
    }
    if (!fileReduction || typeof fileReduction !== 'object') {
        return {};
    }

    const buildArtifacts = fileReduction.findings?.buildArtifacts || [];
    const assetConsolidation = fileReduction.findings?.assetConsolidation || [];
    const buildSummary = fileReduction.scanners?.['build-artifacts'] || {};
    const assetSummary = fileReduction.scanners?.['asset-consolidation'] || {};
    const unusedSummary = fileReduction.scanners?.['unused-files'] || {};
    const safeDirectories = buildArtifacts
        .filter(isDirectoryArtifact)
        .sort((left, right) => (right.sizeBytes || 0) - (left.sizeBytes || 0))
        .slice(0, 12)
        .map((finding) => ({
            path: finding.path,
            bytes: finding.sizeBytes || 0,
            files: finding.fileCount || 0,
            category: finding.category || finding.reason
        }));
    const reviewLogs = buildArtifacts
        .filter((finding) => finding.action === 'review-before-delete' && finding.category === 'logs')
        .slice(0, 10)
        .map((finding) => ({ path: finding.path, bytes: finding.sizeBytes || 0 }));
    const safeBytes = buildSummary.safeToDeleteBytes
        ?? safeDirectories.reduce((sum, entry) => sum + (entry.bytes || 0), 0);
    const reviewBytes = buildSummary.reviewBeforeDeleteBytes
        ?? reviewLogs.reduce((sum, entry) => sum + (entry.bytes || 0), 0);
    const duplicateBytes = assetSummary.reclaimableBytes
        ?? assetConsolidation.reduce((sum, group) => sum + (group.reclaimableBytes || 0), 0);
    const unusedCandidates = unusedSummary.unusedCandidates
        ?? fileReduction.summary?.unusedFileCandidates
        ?? 0;

    if (!safeDirectories.length && !safeBytes && !unusedCandidates && !duplicateBytes && !reviewLogs.length) {
        return existing || {};
    }

    return {
        scopeNote: existing?.scopeNote || 'Synthesized from scan summaries — re-run file reduction if tiers look incomplete.',
        totals: {
            reclaimableBytes: fileReduction.summary?.reclaimableBytes ?? buildSummary.reclaimableBytes ?? safeBytes + duplicateBytes,
            safeToDeleteBytes: safeBytes,
            reviewBeforeDeleteBytes: reviewBytes,
            duplicateAssetBytes: duplicateBytes,
            estimatedImmediateSavingsBytes: safeBytes + duplicateBytes
        },
        safeToDelete: { topDirectories: safeDirectories },
        reviewBeforeDelete: { logs: reviewLogs },
        unusedFiles: {
            candidates: unusedCandidates,
            note: existing?.unusedFiles?.note
                || 'Static analysis only — verify dynamic imports, runtime loaders, and config references before deleting.'
        },
        duplicateAssets: {
            topGroups: assetConsolidation
                .slice()
                .sort((left, right) => (right.reclaimableBytes || 0) - (left.reclaimableBytes || 0))
                .slice(0, 8)
                .map((group) => ({
                    keeper: group.keeper,
                    duplicates: group.duplicates || [],
                    reclaimableBytes: group.reclaimableBytes || 0
                }))
        }
    };
}

function buildAgentPrompt({ projectPath, estimatedReduction, inventory, projectedInventory, policy }) {
    return [
        `Proceed in agent mode using the attached cleanup brief for: ${projectPath}`,
        '',
        'Deletion policy:',
        `- Safe to delete now: regenerable artifacts only (${formatCount(estimatedReduction.files)} files, ${formatBytes(estimatedReduction.bytes)}).`,
        `- Protected (never delete): ${policy.protectedPaths.join(', ')}`,
        '- Review first: logs, scan cache, and anything flagged reviewFirst in the brief',
        '- Do not bulk-delete unused-file candidates without verifying imports',
        '',
        `Inventory: ${formatCount(inventory.totalFiles)} files / ${formatCount(inventory.totalFolders)} folders`,
        `Projected after phase 1: ~${formatCount(projectedInventory.totalFiles)} files`,
        '',
        'Attach the exported cleanup-brief JSON and execute phase 1 only unless I say otherwise.'
    ].join('\n');
}

function buildAgentInstructions(context) {
    return [
        'Execute cleanup in phases: (1) safeNow directories, (2) duplicate asset consolidation, (3) reviewFirst items only after confirmation.',
        `Never delete paths under protected list: ${context.policy.protectedPaths.join(', ')}.`,
        'Do not bulk-delete unused file candidates — they require static/dynamic import verification.',
        context.policy.allowNodeModules
            ? 'node_modules may be removed and restored with npm install.'
            : 'Do not delete node_modules unless the user explicitly enables it.',
        context.policy.allowSimplebeaconCache
            ? '.simplebeacon scan artifacts may be trimmed or archived.'
            : 'Keep .simplebeacon scan artifacts unless the user opts in.',
        `Target inventory reduction: ~${formatCount(context.estimatedReduction.files)} files (${formatBytes(context.estimatedReduction.bytes)}).`
    ];
}

function buildCleanupAssistantBrief({
    projectPath,
    fileReduction,
    dataQuality,
    repositoryInventory,
    policy = DEFAULT_POLICY
} = {}) {
    const plan = resolveFileReductionPlan(fileReduction);
    const enrichedFileReduction = fileReduction && plan && !fileReduction.fileReductionPlan
        ? { ...fileReduction, fileReductionPlan: plan }
        : fileReduction;
    const analysis = buildCompleteScanAnalysis({
        projectPath,
        results: { fileReduction: enrichedFileReduction, dataQuality }
    });
    const inventory = {
        totalFiles: repositoryInventory?.totalFiles ?? fileReduction?.inventory?.totalFiles ?? null,
        totalFolders: repositoryInventory?.totalFolders ?? fileReduction?.inventory?.totalDirectories ?? null
    };

    const tiers = {
        safeNow: { files: 0, bytes: 0, directories: [] },
        reviewFirst: { files: 0, bytes: 0, items: [] },
        protected: { files: 0, bytes: 0, directories: [] },
        investigate: { files: plan.unusedFiles?.candidates ?? 0, note: plan.unusedFiles?.note || null }
    };

    for (const entry of plan.safeToDelete?.topDirectories || []) {
        const tier = classifyDirectory(entry, policy);
        const payload = {
            path: entry.path,
            bytes: entry.bytes || 0,
            files: entry.files || 0,
            category: entry.category || null
        };
        if (tier === 'protected') {
            tiers.protected.files += payload.files;
            tiers.protected.bytes += payload.bytes;
            tiers.protected.directories.push(payload);
        } else if (tier === 'review') {
            tiers.reviewFirst.files += payload.files;
            tiers.reviewFirst.bytes += payload.bytes;
            tiers.reviewFirst.items.push({
                ...payload,
                reason: isNodeModulesPath(entry.path) ? 'node_modules disabled in policy' : 'scan cache disabled in policy'
            });
        } else {
            tiers.safeNow.files += payload.files;
            tiers.safeNow.bytes += payload.bytes;
            tiers.safeNow.directories.push(payload);
        }
    }

    for (const entry of plan.reviewBeforeDelete?.logs || []) {
        tiers.reviewFirst.files += 1;
        tiers.reviewFirst.bytes += entry.bytes || 0;
        tiers.reviewFirst.items.push({
            path: entry.path,
            bytes: entry.bytes || 0,
            files: 1,
            reason: 'log file — review before delete'
        });
    }

    const estimatedReduction = {
        files: tiers.safeNow.files,
        bytes: tiers.safeNow.bytes,
        percentOfInventory: inventory.totalFiles
            ? Number(((tiers.safeNow.files / inventory.totalFiles) * 100).toFixed(1))
            : null
    };

    const projectedInventory = {
        totalFiles: inventory.totalFiles != null
            ? Math.max(0, inventory.totalFiles - tiers.safeNow.files)
            : null,
        totalFolders: inventory.totalFolders
    };

    const agentInstructions = buildAgentInstructions({
        projectPath,
        policy,
        inventory,
        projectedInventory,
        estimatedReduction,
        tiers,
        analysis
    });

    return {
        type: 'simplebeacon-cleanup-brief',
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        projectPath,
        policy,
        inventory,
        projectedInventory,
        estimatedReduction,
        tiers,
        scanAnalysis: analysis,
        duplicateAssets: plan.duplicateAssets?.topGroups?.slice(0, 8) || [],
        dataQualityActions: analysis.priorityActions || [],
        agentInstructions,
        agentPrompt: buildAgentPrompt({ projectPath, estimatedReduction, inventory, projectedInventory, policy })
    };
}

module.exports = {
    DEFAULT_PROTECTED_PATHS,
    DEFAULT_POLICY,
    resolveFileReductionPlan,
    buildCleanupAssistantBrief
};
