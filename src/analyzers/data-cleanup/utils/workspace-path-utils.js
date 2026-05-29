/**
 * Helpers to scope data-quality scans to workspace source, not vendor trees.
 */

const { shouldExcludePath } = require('../../../lib/path-exclusion-filter');

function isVendorPath(relativePath) {
    return shouldExcludePath(String(relativePath || '').replace(/\\/g, '/'));
}

function isWorkspacePath(relativePath) {
    return !isVendorPath(relativePath);
}

function filterWorkspaceFiles(files = []) {
    return files.filter((file) => isWorkspacePath(file.relativePath));
}

module.exports = {
    isVendorPath,
    isWorkspacePath,
    filterWorkspaceFiles
};
