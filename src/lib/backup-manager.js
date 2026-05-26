const fs = require('fs');
const path = require('path');

const BACKUP_MARKER = '.simplebeacon-backup.';

function createBackup(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}${BACKUP_MARKER}${timestamp}`;

    try {
        fs.copyFileSync(filePath, backupPath);
        return backupPath;
    } catch (error) {
        console.warn(`Failed to create backup of ${filePath}: ${error.message}`);
        return null;
    }
}

function restoreFromBackup(backupPath) {
    if (!backupPath || !fs.existsSync(backupPath)) {
        return false;
    }

    const markerIndex = backupPath.lastIndexOf(BACKUP_MARKER);
    if (markerIndex < 0) {
        return false;
    }

    const originalPath = backupPath.slice(0, markerIndex);

    try {
        fs.copyFileSync(backupPath, originalPath);
        return true;
    } catch (error) {
        console.warn(`Failed to restore from ${backupPath}: ${error.message}`);
        return false;
    }
}

function cleanupOldBackups(dir, keep = 5) {
    try {
        const files = fs.readdirSync(dir);
        const groups = new Map();

        for (const name of files) {
            const markerIndex = name.lastIndexOf(BACKUP_MARKER);
            if (markerIndex < 0) continue;
            const originalName = name.slice(0, markerIndex);
            const fullPath = path.join(dir, name);
            const entry = {
                path: fullPath,
                time: fs.statSync(fullPath).mtimeMs
            };
            if (!groups.has(originalName)) groups.set(originalName, []);
            groups.get(originalName).push(entry);
        }

        for (const entries of groups.values()) {
            entries.sort((a, b) => b.time - a.time);
            for (const stale of entries.slice(keep)) {
                try {
                    fs.unlinkSync(stale.path);
                } catch {
                    /* ignore cleanup errors */
                }
            }
        }
    } catch {
        /* ignore cleanup errors */
    }
}

module.exports = {
    BACKUP_MARKER,
    createBackup,
    restoreFromBackup,
    cleanupOldBackups
};
