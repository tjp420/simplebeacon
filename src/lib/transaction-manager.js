const { restoreFromBackup } = require('./backup-manager');

class Transaction {
    constructor() {
        this.backups = [];
        this.completed = false;
    }

    addFile(filePath) {
        const { createBackup } = require('./backup-manager');
        const backupPath = createBackup(filePath);
        if (backupPath) {
            this.backups.push({ backupPath, originalPath: filePath });
        }
    }

    complete() {
        this.completed = true;
    }

    rollback() {
        if (this.completed) {
            throw new Error('Cannot rollback completed transaction');
        }

        for (const entry of this.backups.slice().reverse()) {
            restoreFromBackup(entry.backupPath);
        }
        this.backups = [];
    }

    cleanup() {
        for (const entry of this.backups) {
            try {
                const fs = require('fs');
                fs.unlinkSync(entry.backupPath);
            } catch {
                /* ignore cleanup errors */
            }
        }
        this.backups = [];
    }
}

function withTransactionSync(operation) {
    const transaction = new Transaction();

    try {
        const result = operation(transaction);
        transaction.complete();
        return result;
    } catch (error) {
        transaction.rollback();
        throw error;
    }
}

async function withTransaction(operation) {
    const transaction = new Transaction();

    try {
        const result = await operation(transaction);
        transaction.complete();
        return result;
    } catch (error) {
        transaction.rollback();
        throw error;
    }
}

module.exports = {
    Transaction,
    withTransaction,
    withTransactionSync
};
