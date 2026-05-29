/**
 * Content-hash cache for data-cleanup analyzers — skips unchanged files within TTL.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_TTL_MS = 60 * 60 * 1000;

class AnalyzerCache {
    constructor(projectRoot, options = {}) {
        this.projectRoot = projectRoot;
        this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
        this.cachePath = options.cachePath
            || path.join(projectRoot, '.simplebeacon', 'analyzer-cache.json');
        this.cache = this.loadCache();
    }

    loadCache() {
        try {
            const parsed = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
            return parsed && typeof parsed === 'object'
                ? { files: parsed.files || {}, lastScan: parsed.lastScan || null }
                : { files: {}, lastScan: null };
        } catch {
            return { files: {}, lastScan: null };
        }
    }

    saveCache() {
        try {
            fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
            fs.writeFileSync(this.cachePath, `${JSON.stringify(this.cache, null, 2)}\n`, 'utf8');
        } catch {
            /* cache is best-effort */
        }
    }

    getFileHash(filePath) {
        const content = fs.readFileSync(filePath);
        return crypto.createHash('md5').update(content).digest('hex');
    }

    isFresh() {
        if (!this.cache.lastScan) return false;
        return Date.now() - this.cache.lastScan < this.ttlMs;
    }

    shouldScanFile(filePath) {
        if (!this.isFresh()) return true;
        const key = String(filePath || '').replace(/\\/g, '/');
        const currentHash = this.getFileHash(filePath);
        const cached = this.cache.files[key];
        return !cached || cached.hash !== currentHash;
    }

    rememberFile(filePath) {
        const key = String(filePath || '').replace(/\\/g, '/');
        this.cache.files[key] = {
            hash: this.getFileHash(filePath),
            lastScanned: Date.now()
        };
    }

    markScanComplete() {
        this.cache.lastScan = Date.now();
        this.saveCache();
    }
}

module.exports = {
    AnalyzerCache,
    DEFAULT_TTL_MS
};
