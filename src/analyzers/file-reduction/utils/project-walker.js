/**
 * Walk project files for file-reduction analyzers.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_SKIP_DIRS = new Set([
    '.git',
    '.simplebeacon',
    'node_modules',
    'github-cache',
    'deliverables',
    'java-ai-vulnerable',
    'coverage',
    'dist',
    'build',
    '.next',
    '.cache',
    'uploads',
    'archive',
    'data-central',
    'security-reports',
    '__pycache__',
    '.venv',
    'htmlcov'
]);

function normalizeRel(baseDir, filePath) {
    return path.relative(baseDir, filePath).split(path.sep).join('/');
}

function matchesGlobPattern(name, pattern) {
    if (pattern.startsWith('*.')) {
        return name.endsWith(pattern.slice(1));
    }
    if (pattern.includes('*')) {
        const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`, 'i');
        return regex.test(name);
    }
    return name === pattern;
}

async function walkProjectFiles(projectRoot, options = {}) {
    const root = path.resolve(projectRoot);
    const skipDirs = new Set([...(options.skipDirs || []), ...DEFAULT_SKIP_DIRS]);
    const maxDepth = options.maxDepth ?? 24;
    const files = [];
    const directories = [];

    async function walk(dir, depth) {
        if (depth > maxDepth) return;
        let entries;
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (skipDirs.has(entry.name)) {
                    directories.push({
                        path: fullPath,
                        relativePath: normalizeRel(root, fullPath),
                        name: entry.name,
                        skipped: true
                    });
                    continue;
                }
                directories.push({
                    path: fullPath,
                    relativePath: normalizeRel(root, fullPath),
                    name: entry.name
                });
                await walk(fullPath, depth + 1);
                continue;
            }
            if (!entry.isFile()) continue;
            try {
                const stat = await fs.promises.stat(fullPath);
                files.push({
                    path: fullPath,
                    relativePath: normalizeRel(root, fullPath),
                    name: entry.name,
                    ext: path.extname(entry.name).toLowerCase(),
                    size: stat.size
                });
            } catch {
                /* skip unreadable */
            }
        }
    }

    if (fs.existsSync(root)) {
        await walk(root, 0);
    }

    return { root, files, directories };
}

module.exports = {
    walkProjectFiles,
    normalizeRel,
    matchesGlobPattern,
    DEFAULT_SKIP_DIRS
};
