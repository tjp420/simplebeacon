/**
 * Find duplicate and near-duplicate asset files via content hashing.
 */

const path = require('path');
const assetConfig = require('./config/asset-extensions.json');
const { hashFiles, groupByHash } = require('./utils/hash-utils');
const { walkProjectFiles } = require('./utils/project-walker');

/** Packaged deploy trees copy canonical web assets; not consolidation targets. */
const PACKAGED_FAVICON_PATTERN = /(?:^|\/)cloudflare-deploy\/favicon\.(svg|ico)$/i;

class AssetConsolidationScanner {
    constructor(config = {}) {
        this.assetExtensions = new Set(
            (config.assetExtensions || assetConfig.assetExtensions).map((ext) => ext.toLowerCase())
        );
        this.maxFileSizeForHash = config.maxFileSizeForHash || assetConfig.maxFileSizeForHash;
        this.minGroupSize = config.minGroupSize || assetConfig.minGroupSize;
    }

    async scan(projectRoot, options = {}) {
        const inventory = options.inventory || await walkProjectFiles(projectRoot, options);
        const assetFiles = inventory.files.filter((file) => {
            if (!this.assetExtensions.has(file.ext)) {
                return false;
            }
            const normalized = file.relativePath.split(path.sep).join('/');
            return !PACKAGED_FAVICON_PATTERN.test(normalized);
        });
        const hashed = await hashFiles(assetFiles, { maxBytes: this.maxFileSizeForHash });
        const duplicateGroups = groupByHash(hashed).filter((group) => group.length >= this.minGroupSize);

        const findings = duplicateGroups.map((group) => {
            const sorted = [...group].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
            const reclaimableBytes = sorted.slice(1).reduce((sum, file) => sum + file.size, 0);
            return {
                type: 'asset-duplicate',
                hash: group[0].hash,
                paths: sorted.map((file) => file.relativePath),
                keeper: sorted[0].relativePath,
                duplicates: sorted.slice(1).map((file) => file.relativePath),
                sizeBytes: group[0].size,
                reclaimableBytes,
                confidence: 'high',
                action: 'consolidate-duplicates',
                severity: 'low'
            };
        });

        return {
            scanner: 'asset-consolidation',
            findings,
            summary: {
                assetFilesScanned: assetFiles.length,
                hashedFiles: hashed.length,
                duplicateGroups: findings.length,
                reclaimableBytes: findings.reduce((sum, group) => sum + (group.reclaimableBytes || 0), 0)
            }
        };
    }
}

module.exports = {
    AssetConsolidationScanner
};
