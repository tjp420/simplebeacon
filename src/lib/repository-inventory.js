/**
 * Count all files and folders under a project path (Explorer-style inventory).
 */

const fs = require('fs');
const path = require('path');

const SKIP_BY_PROFILE = {
    explorer: [],
    audit: [
        'node_modules', '.git', 'coverage', 'uploads', 'dist', 'build', 'archive',
        'github-cache', 'deliverables', 'java-ai-vulnerable', '.simplebeacon', 'security-reports'
    ]
};

async function countRepositoryInventory(rootDir, options = {}) {
    const profile = options.profile || 'explorer';
    const skipDirs = new Set(options.skipDirs || SKIP_BY_PROFILE[profile] || SKIP_BY_PROFILE.explorer);
    const maxDepth = options.maxDepth ?? 40;
    let totalFiles = 0;
    let totalFolders = 0;

    async function walk(dir, depth) {
        if (depth > maxDepth) return;
        let entries;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                entries = await fs.promises.readdir(dir, { withFileTypes: true });
                break;
            } catch {
                if (attempt === 2) return;
                await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
            }
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (skipDirs.has(entry.name)) continue;
                totalFolders += 1;
                await walk(fullPath, depth + 1);
                continue;
            }
            if (entry.isFile()) {
                totalFiles += 1;
            }
        }
    }

    const projectRoot = path.resolve(rootDir);
    if (fs.existsSync(projectRoot)) {
        await walk(projectRoot, 0);
    }

    return {
        projectRoot,
        totalFiles,
        totalFolders,
        profile
    };
}

module.exports = {
    countRepositoryInventory,
    SKIP_BY_PROFILE
};
