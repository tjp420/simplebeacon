/**
 * Build actionable executive summaries for cleanup scan reports.
 */

const { triagePrivacyFindings, privacyCategoryLabel } = require('./privacy-triage');

function buildPriorityActions(report, scanners, privacyTriage) {
    const actions = [];

    for (const item of privacyTriage.items) {
        if (item.category !== 'review-required') continue;
        actions.push({
            priority: item.kind === 'credential' ? 'critical' : 'high',
            title: item.kind === 'credential' ? 'Investigate credential exposure' : 'Review PII in data file',
            detail: `${item.path}:${item.line || '?'} (${item.pattern || item.kind})`
        });
    }

    const env = scanners['environment-variables'] || {};
    if ((env.missingKeys || 0) > 0) {
        actions.push({
            priority: 'high',
            title: 'Resolve missing environment keys',
            detail: `${env.missingKeys} code references lack a matching .env definition`
        });
    }

    const config = scanners['config-management'] || {};
    if ((config.inconsistentEnvKeys || 0) > 0) {
        actions.push({
            priority: 'high',
            title: 'Align environment values',
            detail: `${config.inconsistentEnvKeys} keys differ across env files`
        });
    }

    const consistency = scanners['data-consistency'] || {};
    if ((consistency.shapeDriftGroups || 0) > 0) {
        actions.push({
            priority: 'medium',
            title: 'Fix JSON shape drift',
            detail: `${consistency.shapeDriftGroups} schema drift group(s) detected`
        });
    }

    const access = scanners['data-access-patterns'] || {};
    if ((access.patternFindings || 0) > 0) {
        actions.push({
            priority: 'medium',
            title: 'Review sync I/O hot paths',
            detail: `${access.patternFindings} synchronous filesystem access pattern(s)`
        });
    }

    const build = scanners['build-artifacts'] || {};
    if ((build.safeToDeleteBytes || build.reclaimableBytes || 0) > 0) {
        actions.push({
            priority: 'medium',
            title: 'Reclaim build artifact space',
            detail: `${build.safeToDeleteBytes || build.reclaimableBytes} bytes in regenerable artifact directories`
        });
    }

    return actions.slice(0, 8);
}

function buildExecutiveSummary(report) {
    const scanners = report.scanners || {};
    const profile = report.scanProfile || 'all';
    const privacyTriage = triagePrivacyFindings(report.findings?.dataPrivacy || []);
    const credentialFindings = privacyTriage.items.filter((item) => item.kind === 'credential');
    const piiFindings = privacyTriage.items.filter((item) => item.kind === 'pii');

    const dep = scanners['dependency-health'] || {};
    const config = scanners['config-management'] || {};
    const env = scanners['environment-variables'] || {};
    const privacy = scanners['data-privacy'] || {};
    const lineage = scanners['data-lineage'] || {};
    const consistency = scanners['data-consistency'] || {};
    const access = scanners['data-access-patterns'] || {};
    const freshness = scanners['data-freshness'] || {};
    const build = scanners['build-artifacts'] || {};

    const notes = [
        'Config, dependency, and environment scanner counts exclude node_modules and other vendor trees.',
        'Unused dependencies are based on static imports only — verify CLI, test, and config usage before removal.',
        'Unused env keys may still be supplied by Docker, CI, or runtime injection.',
        'PII hits in docs, reports, and sample data are common — review production paths first.'
    ];

    if (credentialFindings.length && privacyTriage.credentialsNeedingReview === 0) {
        notes.unshift('All credential hits are documented examples or intentional test fixtures.');
    }

    if (piiFindings.length && privacyTriage.piiNeedingReview === 0) {
        notes.unshift('All PII hits are in documentation, reports, or mock/sample data.');
    }

    return {
        profile,
        generatedAt: report.generatedAt || new Date().toISOString(),
        priorityActions: buildPriorityActions(report, scanners, privacyTriage),
        security: {
            credentialHits: privacy.credentialHits || credentialFindings.length,
            credentialsNeedingReview: privacyTriage.credentialsNeedingReview,
            piiHits: privacy.piiHits || piiFindings.length,
            piiNeedingReview: privacyTriage.piiNeedingReview,
            credentials: credentialFindings,
            piiByCategory: Object.entries(privacyTriage.byCategory)
                .filter(([category]) => category !== 'review-required' || privacyTriage.byCategory[category])
                .map(([category, count]) => ({
                    category,
                    categoryLabel: privacyCategoryLabel(category),
                    count
                }))
                .sort((a, b) => b.count - a.count),
            piiSamples: piiFindings
                .filter((item) => item.category === 'review-required')
                .slice(0, 5)
        },
        workspace: {
            packageJsonFiles: dep.packageJsonFiles || 0,
            unusedDependencies: dep.unusedDependencies || 0,
            versionDrift: dep.versionDrift || 0,
            duplicateDependencies: dep.duplicateDependencies || 0,
            envFiles: config.envFiles || env.envFiles || 0,
            envInconsistencies: config.inconsistentEnvKeys || 0,
            unusedEnvKeys: env.unusedKeys || 0,
            missingEnvKeys: env.missingKeys || 0
        },
        data: {
            orphanedDataFiles: lineage.orphanedDataFiles || 0,
            shapeDriftGroups: consistency.shapeDriftGroups || 0,
            staleDataFiles: freshness.staleFiles || 0,
            syncIoPatterns: access.patternFindings || 0
        },
        fileReduction: {
            reclaimableBytes: report.summary?.reclaimableBytes || build.reclaimableBytes || 0,
            safeToDeleteBytes: build.safeToDeleteBytes || report.fileReductionPlan?.totals?.safeToDeleteBytes || 0,
            reviewBeforeDeleteBytes: build.reviewBeforeDeleteBytes || report.fileReductionPlan?.totals?.reviewBeforeDeleteBytes || 0,
            duplicateAssetBytes: report.scanners?.['asset-consolidation']?.reclaimableBytes || 0,
            estimatedImmediateSavingsBytes: report.fileReductionPlan?.totals?.estimatedImmediateSavingsBytes || 0,
            buildArtifactFindings: report.summary?.buildArtifactFindings || 0,
            unusedFileCandidates: report.summary?.unusedFileCandidates || 0,
            duplicateAssetGroups: report.summary?.duplicateAssetGroups || 0
        },
        notes
    };
}

module.exports = {
    buildExecutiveSummary
};
