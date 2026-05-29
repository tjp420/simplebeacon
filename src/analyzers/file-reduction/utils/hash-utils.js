/**
 * Fast file hashing for duplicate asset detection.
 */

const fs = require('fs');

const { hashFileContent } = require('../../../lib/mock-data-schema-validator');

async function computeFileHash(filePath, options = {}) {
    const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
    const stat = await fs.promises.stat(filePath);
    if (stat.size > maxBytes) {
        return null;
    }
    const content = await fs.promises.readFile(filePath);
    return hashFileContent(content);
}

async function hashFiles(files, options = {}) {
    const hashed = [];
    for (const file of files) {
        try {
            const hash = await computeFileHash(file.path, options);
            if (!hash) continue;
            hashed.push({ ...file, hash });
        } catch {
            /* skip unreadable */
        }
    }
    return hashed;
}

function groupByHash(entries) {
    const groups = new Map();
    for (const entry of entries) {
        const bucket = groups.get(entry.hash) || [];
        bucket.push(entry);
        groups.set(entry.hash, bucket);
    }
    return [...groups.values()].filter((group) => group.length > 1);
}

module.exports = {
    computeFileHash,
    hashFiles,
    groupByHash,
    hashFileContent
};
