const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function buildTempPath(filePath) {
    const dir = path.dirname(filePath);
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    return path.join(dir, `.${path.basename(filePath)}.tmp.${randomSuffix}`);
}

async function atomicWriteFile(filePath, content, options = {}) {
    const { mode = 0o644, encoding = 'utf8' } = options;
    const tempPath = buildTempPath(filePath);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    try {
        await fs.promises.writeFile(tempPath, content, { encoding, mode });
        const handle = await fs.promises.open(tempPath, 'r');
        try {
            await handle.sync();
        } finally {
            await handle.close();
        }
        await fs.promises.rename(tempPath, filePath);
    } catch (error) {
        try {
            await fs.promises.unlink(tempPath);
        } catch {
            /* ignore cleanup errors */
        }
        throw error;
    }
}

function atomicWriteFileSync(filePath, content, options = {}) {
    const { mode = 0o644, encoding = 'utf8' } = options;
    const tempPath = buildTempPath(filePath);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    try {
        fs.writeFileSync(tempPath, content, { encoding, mode });
        fs.renameSync(tempPath, filePath);
    } catch (error) {
        try {
            fs.unlinkSync(tempPath);
        } catch {
            /* ignore cleanup errors */
        }
        throw error;
    }
}

module.exports = {
    atomicWriteFile,
    atomicWriteFileSync
};
