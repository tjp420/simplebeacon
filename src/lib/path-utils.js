/**
 * Path normalization and containment checks for scan/config resolution.
 */

const fs = require('fs');
const path = require('path');
const { PathError, ConfigError } = require('./errors');
const { sanitizeFilePath } = require('./input-sanitizer');

function normalizePathKey(filePath) {
    return path.resolve(filePath).replace(/\\/g, '/').toLowerCase();
}

function isPathWithinRoot(childPath, rootPath) {
    const child = normalizePathKey(childPath);
    const root = normalizePathKey(rootPath);
    return child === root || child.startsWith(`${root}/`);
}

function assertPathWithinRoot(childPath, rootPath, context = {}) {
    if (!isPathWithinRoot(childPath, rootPath)) {
        throw new ConfigError('Path must stay within the project root', {
            path: childPath,
            root: rootPath,
            ...context
        });
    }
}

function resolveCliProjectRoot(rawPath, options = {}) {
    const {
        mustExist = true,
        mustBeDirectory = true,
        label = 'Project path'
    } = options;

    const sanitized = sanitizeFilePath(rawPath);
    if (!sanitized) {
        throw new PathError(`${label} is required`, { rawPath });
    }

    const resolved = path.resolve(sanitized);
    if (!mustExist) {
        return resolved;
    }

    if (!fs.existsSync(resolved)) {
        throw new PathError(`${label} does not exist: ${resolved}`, { path: resolved });
    }

    if (mustBeDirectory) {
        let stat;
        try {
            stat = fs.statSync(resolved);
        } catch (error) {
            throw new PathError(`${label} is not accessible: ${resolved}`, {
                path: resolved,
                originalError: error.message
            });
        }
        if (!stat.isDirectory()) {
            throw new PathError(`${label} must be a directory: ${resolved}`, { path: resolved });
        }
    }

    return resolved;
}

function resolveSafeRelativePath(baseDir, relativePath, options = {}) {
    const { label = relativePath, allowOutside = false } = options;
    const normalized = String(relativePath || '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '');

    if (!normalized) {
        return null;
    }

    const resolved = path.isAbsolute(normalized)
        ? path.resolve(normalized)
        : path.resolve(baseDir, ...normalized.split('/'));

    if (!allowOutside && !path.isAbsolute(normalized)) {
        assertPathWithinRoot(resolved, baseDir, { relativePath: normalized, label });
    }

    return resolved;
}

function sanitizeCliPathOptions(options) {
    const sanitized = { ...options };

    if (sanitized.path != null) {
        sanitized.path = sanitizeFilePath(sanitized.path) || process.cwd();
    }
    if (sanitized.config) {
        sanitized.config = sanitizeFilePath(sanitized.config);
    }
    if (sanitized.output) {
        sanitized.output = sanitizeFilePath(sanitized.output);
    }
    if (sanitized.report) {
        sanitized.report = sanitizeFilePath(sanitized.report);
    }
    if (sanitized.upload) {
        sanitized.upload = sanitizeFilePath(sanitized.upload);
    }

    return sanitized;
}

module.exports = {
    normalizePathKey,
    isPathWithinRoot,
    assertPathWithinRoot,
    resolveCliProjectRoot,
    resolveSafeRelativePath,
    sanitizeCliPathOptions
};
