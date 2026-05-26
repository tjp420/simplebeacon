/**
 * Path containment checks for user-supplied scan and config paths.
 */

const path = require('path');
const { PathError } = require('./errors');
const { sanitizeFilePath } = require('./input-sanitizer');
const { isPathWithinRoot } = require('./path-utils');

class PathSanitizer {
    constructor(baseDir) {
        this.baseDir = path.resolve(baseDir);
    }

    isWithinBaseDir(resolvedPath) {
        return isPathWithinRoot(resolvedPath, this.baseDir);
    }

    sanitize(inputPath, options = {}) {
        const { allowAbsoluteOutside = true } = options;
        const cleaned = sanitizeFilePath(inputPath);

        if (!cleaned) {
            return path.normalize(this.baseDir);
        }

        const resolved = path.isAbsolute(cleaned)
            ? path.resolve(cleaned)
            : path.resolve(this.baseDir, ...cleaned.replace(/\\/g, '/').split('/'));

        if (!path.isAbsolute(cleaned) && !this.isWithinBaseDir(resolved)) {
            throw new PathError(`Path traversal attempt blocked: ${inputPath}`, {
                path: resolved,
                root: this.baseDir,
                inputPath
            });
        }

        if (path.isAbsolute(cleaned) && !allowAbsoluteOutside && !this.isWithinBaseDir(resolved)) {
            throw new PathError(`Path must stay within project root: ${inputPath}`, {
                path: resolved,
                root: this.baseDir,
                inputPath
            });
        }

        return path.normalize(resolved);
    }

    safeJoin(...pathSegments) {
        const joined = path.join(this.baseDir, ...pathSegments);
        return this.sanitize(joined, { allowAbsoluteOutside: false });
    }
}

function sanitizePath(userInputPath, rootDir = process.cwd()) {
    return new PathSanitizer(rootDir).sanitize(userInputPath);
}

module.exports = {
    PathSanitizer,
    sanitizePath
};
