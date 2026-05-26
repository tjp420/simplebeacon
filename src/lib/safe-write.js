const fs = require('fs');
const path = require('path');
const { atomicWriteFileSync } = require('./atomic-writer');
const { createBackup, restoreFromBackup, cleanupOldBackups } = require('./backup-manager');
const { validateFile } = require('./file-validator');

function writeManagedFileSync(filePath, content, options = {}) {
    const {
        dryRun = false,
        validators = [],
        mode = 0o644,
        encoding = 'utf8',
        backupBeforeOverwrite = true,
        keepBackups = 5,
        transaction = null,
        skipIfExists = false,
        force = false
    } = options;

    const targetPath = path.resolve(filePath);
    const existed = fs.existsSync(targetPath);

    if (dryRun) {
        return {
            dryRun: true,
            filePath: targetPath,
            action: existed ? (force || !skipIfExists ? 'overwrite' : 'skip') : 'create',
            wouldOverwrite: existed && (force || !skipIfExists)
        };
    }

    if (existed && skipIfExists && !force) {
        return {
            filePath: targetPath,
            skipped: true,
            created: false,
            overwritten: false
        };
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    let backupPath = null;
    if (existed && backupBeforeOverwrite) {
        if (transaction) {
            transaction.addFile(targetPath);
        } else {
            backupPath = createBackup(targetPath);
        }
    }

    try {
        atomicWriteFileSync(targetPath, content, { mode, encoding });

        if (validators.length > 0) {
            const validation = validateFile(targetPath, validators);
            if (!validation.valid) {
                throw new Error(`Validation failed for ${targetPath}`);
            }
        }

        cleanupOldBackups(path.dirname(targetPath), keepBackups);

        return {
            filePath: targetPath,
            backupPath,
            created: !existed,
            overwritten: existed,
            skipped: false
        };
    } catch (error) {
        if (!transaction && backupPath) {
            restoreFromBackup(backupPath);
        }
        throw error;
    }
}

module.exports = {
    writeManagedFileSync
};
