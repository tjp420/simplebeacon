/**
 * Enrich complete scan exports with corrected analysis metadata.
 */

const { enrichCleanupReport } = require('./enrich-cleanup-report');

function buildCompleteScanAnalysis(completeScan) {
    const fileReduction = completeScan?.results?.fileReduction;
    const dataQuality = completeScan?.results?.dataQuality;
    const frPlan = fileReduction?.fileReductionPlan;
    const frExec = fileReduction?.executiveSummary;
    const dqExec = dataQuality?.executiveSummary;
    const dqStats = dataQuality?.scannerStatistics;

    const priorityActions = [
        ...(frExec?.priorityActions || []),
        ...(dqExec?.priorityActions || [])
    ].slice(0, 10);

    return {
        generatedAt: new Date().toISOString(),
        projectPath: completeScan?.projectPath || fileReduction?.projectRoot || '',
        fileReduction: frPlan ? {
            safeToDeleteBytes: frPlan.totals?.safeToDeleteBytes ?? null,
            reviewBeforeDeleteBytes: frPlan.totals?.reviewBeforeDeleteBytes ?? null,
            immediateSavingsBytes: frPlan.totals?.estimatedImmediateSavingsBytes ?? null,
            duplicateAssetBytes: frPlan.totals?.duplicateAssetBytes ?? null,
            unusedFileCandidates: frPlan.unusedFiles?.candidates ?? null,
            topSafeDirectories: frPlan.safeToDelete?.topDirectories?.slice(0, 8) || [],
            reviewLogs: frPlan.reviewBeforeDelete?.logs?.slice(0, 8) || [],
            summaryTable: frPlan.summaryTable || []
        } : null,
        dataQuality: dqExec ? {
            workspacePackages: dqExec.workspace?.packageJsonFiles ?? null,
            unusedDependencies: dqExec.workspace?.unusedDependencies ?? null,
            envInconsistencies: dqExec.workspace?.envInconsistencies ?? null,
            missingEnvKeys: dqExec.workspace?.missingEnvKeys ?? null,
            shapeDriftGroups: dqExec.data?.shapeDriftGroups ?? null,
            syncIoPatterns: dqExec.data?.syncIoPatterns ?? null,
            orphanedDataFiles: dqExec.data?.orphanedDataFiles ?? null,
            credentialsNeedingReview: dqExec.security?.credentialsNeedingReview ?? null,
            piiNeedingReview: dqExec.security?.piiNeedingReview ?? null,
            piiByCategory: dqExec.security?.piiByCategory || []
        } : null,
        priorityActions,
        notes: [
            ...(frPlan?.scopeNote ? [frPlan.scopeNote] : []),
            ...(dqStats?.scopeNote ? [dqStats.scopeNote] : []),
            ...(frExec?.notes || []),
            ...(dqExec?.notes || [])
        ].filter((note, index, all) => all.indexOf(note) === index).slice(0, 6)
    };
}

function enrichCompleteScan(completeScan) {
    if (!completeScan || typeof completeScan !== 'object') {
        throw new Error('Complete scan payload required');
    }

    const enriched = {
        ...completeScan,
        version: '1.3.0',
        enrichedAt: new Date().toISOString()
    };

    if (enriched.results?.fileReduction) {
        enriched.results.fileReduction = enrichCleanupReport(enriched.results.fileReduction, {
            profile: 'file-reduction'
        });
    }

    if (enriched.results?.dataQuality) {
        enriched.results.dataQuality = enrichCleanupReport(enriched.results.dataQuality, {
            profile: 'data-quality'
        });
    }

    const fr = enriched.results?.fileReduction;
    const dq = enriched.results?.dataQuality;
    const frPlan = fr?.fileReductionPlan;
    const dqWorkspace = dq?.executiveSummary?.workspace;
    const dqSecurity = dq?.executiveSummary?.security;

    enriched.summary = {
        ...(enriched.summary || {}),
        fileReductionSafeToDeleteBytes: frPlan?.totals?.safeToDeleteBytes ?? fr?.scanners?.['build-artifacts']?.safeToDeleteBytes ?? null,
        fileReductionReviewBytes: frPlan?.totals?.reviewBeforeDeleteBytes ?? fr?.scanners?.['build-artifacts']?.reviewBeforeDeleteBytes ?? null,
        fileReductionImmediateSavingsBytes: frPlan?.totals?.estimatedImmediateSavingsBytes ?? null,
        fileReductionReclaimableBytes: fr?.summary?.reclaimableBytes ?? enriched.summary?.fileReductionReclaimableBytes ?? null,
        fileReductionUnusedCandidates: frPlan?.unusedFiles?.candidates ?? fr?.summary?.unusedFileCandidates ?? null,
        dataQualityFindings: dq?.summary?.totalFindings ?? enriched.summary?.dataQualityFindings ?? null,
        dataQualityWorkspacePackages: dqWorkspace?.packageJsonFiles ?? dq?.scanners?.['dependency-health']?.packageJsonFiles ?? null,
        dataQualityUnusedDependencies: dqWorkspace?.unusedDependencies ?? dq?.scanners?.['dependency-health']?.unusedDependencies ?? null,
        dataQualityCredentialsNeedingReview: dqSecurity?.credentialsNeedingReview ?? null,
        dataQualityPiiNeedingReview: dqSecurity?.piiNeedingReview ?? null
    };

    enriched.completeScanAnalysis = buildCompleteScanAnalysis(enriched);
    return enriched;
}

module.exports = {
    enrichCompleteScan,
    buildCompleteScanAnalysis
};
