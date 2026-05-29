/**
 * Coordinates file-reduction analyzers with shared inventory and ordering.
 */

const { runFileReductionAnalysis, DEFAULT_SCANNERS } = require('../analyzers/file-reduction');
const { normalizeFileReductionReport } = require('./normalize-file-reduction-report');

class FileReductionOrchestrator {
    constructor(options = {}) {
        this.options = {
            dryRun: options.dryRun !== false,
            scanners: options.scanners || {},
            maxDepth: options.maxDepth,
            skipDirs: options.skipDirs
        };
    }

    async run(projectRoot) {
        return runFileReductionAnalysis(projectRoot, this.options);
    }

    listScanners() {
        return DEFAULT_SCANNERS.map((entry) => ({
            id: entry.id,
            enabled: this.options.scanners[entry.id]?.enabled !== false,
            priority: entry.priority
        }));
    }
}

async function runFileReductionScan(projectRoot, options = {}) {
    const orchestrator = new FileReductionOrchestrator(options);
    const report = await orchestrator.run(projectRoot);
    return normalizeFileReductionReport(report);
}

module.exports = {
    FileReductionOrchestrator,
    runFileReductionScan
};
