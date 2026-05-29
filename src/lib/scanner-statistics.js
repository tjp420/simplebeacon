/**
 * Build human-readable scanner statistics for exports and dashboard views.
 * Counts are workspace-scoped for config/dependency/env scanners.
 */

function countFindingsByType(findings = []) {
    const counts = {};
    for (const finding of findings) {
        const key = finding.type || 'other';
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
}

function buildScannerStatistics(report) {
    const scanners = report.scanners || {};
    const findings = report.findings || {};
    const configCounts = countFindingsByType(findings.configManagement);
    const depCounts = countFindingsByType(findings.dependencyHealth);
    const envCounts = countFindingsByType(findings.environmentVariables);
    const privacyCounts = countFindingsByType(findings.dataPrivacy);
    const accessCounts = countFindingsByType(findings.dataAccessPatterns);
    const lineageCounts = countFindingsByType(findings.dataLineage);
    const consistencyCounts = countFindingsByType(findings.dataConsistency);

    const config = scanners['config-management'] || {};
    const dep = scanners['dependency-health'] || {};
    const env = scanners['environment-variables'] || {};
    const freshness = scanners['data-freshness'] || {};
    const access = scanners['data-access-patterns'] || {};
    const privacy = scanners['data-privacy'] || {};
    const lineage = scanners['data-lineage'] || {};
    const consistency = scanners['data-consistency'] || {};

    return {
        scope: 'workspace',
        scopeNote: 'Config, dependency, and environment scanner counts exclude node_modules and other vendor trees.',
        project: {
            totalFiles: report.inventory?.totalFiles || 0,
            totalDirectories: report.inventory?.totalDirectories || 0,
            durationMs: report.durationMs || 0,
            projectRoot: report.projectRoot || ''
        },
        scanners: {
            'config-management': {
                label: 'Config Management',
                stats: {
                    configFiles: config.configFiles || 0,
                    envFiles: config.envFiles || 0,
                    packageJsonFiles: config.packageJsonFiles || 0,
                    sprawlFindings: config.sprawlFindings || 0,
                    inconsistentEnvKeys: config.inconsistentEnvKeys || 0
                },
                findings: {
                    total: (findings.configManagement || []).length,
                    configSprawl: configCounts['config-sprawl'] || 0,
                    duplicateConfigTypes: configCounts['duplicate-config-type'] || 0,
                    envInconsistencies: configCounts['env-inconsistency'] || 0,
                    obsoleteConfig: configCounts['obsolete-config'] || 0
                }
            },
            'dependency-health': {
                label: 'Dependency Health',
                stats: {
                    packageJsonFiles: dep.packageJsonFiles || 0,
                    uniqueDependencies: dep.uniqueDependencies || 0,
                    unusedDependencies: dep.unusedDependencies || 0,
                    versionDrift: dep.versionDrift || 0,
                    duplicateDependencies: dep.duplicateDependencies || depCounts['duplicate-dependency'] || 0
                },
                findings: {
                    total: (findings.dependencyHealth || []).length,
                    unusedDependencies: depCounts['unused-dependency'] || 0,
                    duplicateDependencies: depCounts['duplicate-dependency'] || 0,
                    versionDrift: depCounts['version-drift'] || 0,
                    invalidPackageJson: depCounts['invalid-package-json'] || 0
                }
            },
            'environment-variables': {
                label: 'Environment Variables',
                stats: {
                    envFiles: env.envFiles || 0,
                    envKeys: env.envKeys || 0,
                    referencedKeys: env.referencedKeys || 0,
                    secretFindings: env.secretFindings || 0,
                    missingKeys: env.missingKeys || 0,
                    unusedKeys: env.unusedKeys || 0
                },
                findings: {
                    total: (findings.environmentVariables || []).length,
                    missingKeys: envCounts['missing-env-key'] || 0,
                    unusedKeys: envCounts['unused-env-key'] || 0,
                    envSecrets: envCounts['env-secret'] || 0,
                    envInconsistencies: envCounts['env-inconsistency'] || 0
                }
            },
            'data-freshness': {
                label: 'Data Freshness',
                stats: {
                    dataFilesScanned: freshness.dataFilesScanned || 0,
                    staleFiles: freshness.staleFiles || 0,
                    criticalStale: freshness.criticalStale || 0
                },
                findings: {
                    total: (findings.dataFreshness || []).length,
                    staleData: countFindingsByType(findings.dataFreshness)['stale-data'] || 0
                }
            },
            'data-access-patterns': {
                label: 'Data Access Patterns',
                stats: {
                    sourceFilesScanned: access.sourceFilesScanned || 0,
                    patternFindings: access.patternFindings || 0
                },
                findings: {
                    total: (findings.dataAccessPatterns || []).length,
                    patternIssues: accessCounts['data-access-pattern'] || 0
                }
            },
            'data-privacy': {
                label: 'Data Privacy',
                stats: {
                    dataFilesScanned: privacy.dataFilesScanned || 0,
                    privacyFindings: privacy.privacyFindings || 0,
                    credentialHits: privacy.credentialHits || 0,
                    piiHits: privacy.piiHits || 0
                },
                findings: {
                    total: (findings.dataPrivacy || []).length,
                    credentialHits: privacyCounts['data-privacy']
                        ? (findings.dataPrivacy || []).filter((f) => String(f.reason).includes('Credential')).length
                        : 0,
                    piiHits: (findings.dataPrivacy || []).filter((f) => !String(f.reason).includes('Credential')).length
                }
            },
            'data-lineage': {
                label: 'Data Lineage',
                stats: {
                    dataFilesTracked: lineage.dataFilesTracked || 0,
                    orphanedDataFiles: lineage.orphanedDataFiles || 0,
                    connectedDataFiles: lineage.connectedDataFiles || 0
                },
                findings: {
                    total: (findings.dataLineage || []).length,
                    orphanedDataFiles: lineageCounts['orphaned-data'] || 0
                }
            },
            'data-consistency': {
                label: 'Data Consistency',
                stats: {
                    jsonDataFiles: consistency.jsonDataFiles || 0,
                    directoriesCompared: consistency.directoriesCompared || 0,
                    shapeDriftGroups: consistency.shapeDriftGroups || 0
                },
                findings: {
                    total: (findings.dataConsistency || []).length,
                    shapeDriftGroups: consistencyCounts['data-shape-drift'] || 0
                }
            }
        },
        findingsBreakdown: {
            configManagement: {
                total: (findings.configManagement || []).length,
                configSprawl: configCounts['config-sprawl'] || 0,
                duplicateConfigTypes: configCounts['duplicate-config-type'] || 0,
                envInconsistencies: configCounts['env-inconsistency'] || 0
            },
            dependencyHealth: {
                total: (findings.dependencyHealth || []).length,
                unusedDependencies: depCounts['unused-dependency'] || 0,
                duplicateDependencies: depCounts['duplicate-dependency'] || 0,
                versionDrift: depCounts['version-drift'] || 0
            },
            environmentVariables: {
                total: (findings.environmentVariables || []).length,
                missingKeys: envCounts['missing-env-key'] || 0,
                unusedKeys: envCounts['unused-env-key'] || 0
            },
            dataPrivacy: {
                total: (findings.dataPrivacy || []).length,
                credentialHits: (findings.dataPrivacy || []).filter((f) => String(f.reason).includes('Credential')).length,
                piiHits: (findings.dataPrivacy || []).filter((f) => !String(f.reason).includes('Credential')).length
            },
            dataAccessPatterns: {
                total: (findings.dataAccessPatterns || []).length,
                patternIssues: accessCounts['data-access-pattern'] || 0
            },
            dataLineage: {
                total: (findings.dataLineage || []).length,
                orphanedDataFiles: lineageCounts['orphaned-data'] || 0
            },
            dataConsistency: {
                total: (findings.dataConsistency || []).length,
                shapeDriftGroups: consistencyCounts['data-shape-drift'] || 0
            }
        }
    };
}

module.exports = {
    buildScannerStatistics,
    countFindingsByType
};
