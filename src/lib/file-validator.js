const fs = require('fs');

function validateJSON(filePath) {
    try {
        JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return true;
    } catch {
        return false;
    }
}

function validateNotEmpty(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8').trim().length > 0;
    } catch {
        return false;
    }
}

function validatePermissions(filePath, expectedMode = 0o644) {
    if (process.platform === 'win32') {
        return true;
    }
    try {
        const stats = fs.statSync(filePath);
        return (stats.mode & 0o777) === expectedMode;
    } catch {
        return false;
    }
}

function validateGitHook(hookPath) {
    try {
        const content = fs.readFileSync(hookPath, 'utf8');
        if (!content.startsWith('#!')) return false;
        if (!content.includes('simplebeacon')) return false;
        return content.trim().length > 0;
    } catch {
        return false;
    }
}

function validateFile(filePath, validators = []) {
    const results = validators.map((validator) => ({
        name: validator.name || 'validator',
        valid: Boolean(validator(filePath))
    }));

    return {
        valid: results.every((result) => result.valid),
        results
    };
}

module.exports = {
    validateJSON,
    validateNotEmpty,
    validatePermissions,
    validateGitHook,
    validateFile
};
