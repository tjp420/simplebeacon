/**
 * Identify stale mock/config/data files by age.
 */

const fs = require('fs');
const { isDataFile, daysSince, getGitLastCommitDate } = require('./utils/data-file-utils');

class DataFreshnessAnalyzer {
    constructor(config = {}) {
        this.staleDays = config.staleDays ?? 180;
        this.criticalStaleDays = config.criticalStaleDays ?? 365;
    }

    async scan(projectRoot, options = {}) {
        const inventory = options.inventory;
        const dataFiles = inventory.files.filter((file) => isDataFile(file));
        const findings = [];

        for (const file of dataFiles) {
            let mtime = null;
            try {
                mtime = (await fs.promises.stat(file.path)).mtime;
            } catch {
                continue;
            }

            const gitDate = getGitLastCommitDate(file.path, projectRoot);
            const referenceDate = gitDate || mtime;
            const ageDays = daysSince(referenceDate);
            if (ageDays == null) continue;

            const stalenessScore = Math.min(1, ageDays / this.criticalStaleDays);
            if (ageDays < this.staleDays) continue;

            findings.push({
                type: 'stale-data',
                path: file.relativePath,
                reason: `Data file last changed ${ageDays} days ago (${gitDate ? 'git' : 'filesystem'})`,
                severity: ageDays >= this.criticalStaleDays ? 'medium' : 'low',
                confidence: gitDate ? 'high' : 'medium',
                action: 'refresh-or-archive',
                metadata: {
                    ageDays,
                    stalenessScore: Math.round(stalenessScore * 100) / 100,
                    lastModified: referenceDate.toISOString()
                }
            });
        }

        return {
            scanner: 'data-freshness',
            findings,
            summary: {
                dataFilesScanned: dataFiles.length,
                staleFiles: findings.length,
                criticalStale: findings.filter((f) => f.severity === 'medium').length
            }
        };
    }
}

module.exports = {
    DataFreshnessAnalyzer
};
