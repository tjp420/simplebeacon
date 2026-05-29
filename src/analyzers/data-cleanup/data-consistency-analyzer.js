/**
 * Compare JSON data shapes within the same directory for drift.
 */

const fs = require('fs');
const { isDataFile, isDataPath } = require('./utils/data-file-utils');

function topLevelKeys(content) {
    try {
        const payload = JSON.parse(content);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
        return Object.keys(payload).sort();
    } catch {
        return null;
    }
}

class DataConsistencyAnalyzer {
    async scan(projectRoot, options = {}) {
        const inventory = options.inventory;
        const jsonDataFiles = inventory.files.filter((file) => file.ext === '.json' && isDataFile(file));
        const byDirectory = new Map();

        for (const file of jsonDataFiles) {
            const dir = file.relativePath.split('/').slice(0, -1).join('/') || '.';
            const bucket = byDirectory.get(dir) || [];
            bucket.push(file);
            byDirectory.set(dir, bucket);
        }

        const findings = [];
        for (const [dir, files] of byDirectory.entries()) {
            if (files.length < 2) continue;
            if (isDataPath(dir) || files.every((file) => /sample|mock|fixture|seed|snapshot/i.test(file.name))) {
                continue;
            }
            const signatures = new Map();
            for (const file of files) {
                let content = '';
                try {
                    content = await fs.promises.readFile(file.path, 'utf8');
                } catch {
                    continue;
                }
                const keys = topLevelKeys(content);
                if (keys == null) continue;
                const signature = keys.join('|');
                const bucket = signatures.get(signature) || [];
                bucket.push({ file, keys });
                signatures.set(signature, bucket);
            }
            if (signatures.size <= 1) continue;
            findings.push({
                type: 'data-shape-drift',
                path: dir,
                reason: `${signatures.size} different JSON top-level shapes in the same data directory`,
                severity: 'medium',
                confidence: 'high',
                action: 'align-schemas-or-split-directories',
                metadata: {
                    groups: [...signatures.entries()].map(([_signature, entries]) => ({
                        keys: entries[0].keys,
                        files: entries.map((entry) => entry.file.relativePath)
                    }))
                }
            });
        }

        return {
            scanner: 'data-consistency',
            findings,
            summary: {
                jsonDataFiles: jsonDataFiles.length,
                directoriesCompared: byDirectory.size,
                shapeDriftGroups: findings.length
            }
        };
    }
}

module.exports = {
    DataConsistencyAnalyzer,
    topLevelKeys
};
