/**
 * Detect build artifacts, caches, and generated output directories.
 */

const defaultPatterns = require('./config/build-artifact-patterns.json');
const { walkProjectFiles, matchesGlobPattern } = require('./utils/project-walker');
const {
    isUnderArtifactRoot,
    selectTopLevelArtifactDirectories
} = require('./utils/artifact-path-utils');

class BuildArtifactScanner {
    constructor(config = {}) {
        this.patterns = {
            directories: config.directories || defaultPatterns.directories,
            files: config.files || defaultPatterns.files,
            extensions: config.extensions || defaultPatterns.extensions,
            ignorePaths: config.ignorePaths || defaultPatterns.ignorePaths
        };
    }

    async scan(projectRoot, options = {}) {
        const inventory = options.inventory || await walkProjectFiles(projectRoot, options);
        const { findings: directoryFindings, artifactRoots } = selectTopLevelArtifactDirectories(
            inventory.directories,
            inventory,
            this.patterns
        );
        const findings = [...directoryFindings];

        for (const file of inventory.files) {
            if (isUnderArtifactRoot(file.relativePath, artifactRoots)) continue;
            if (!this.matchesArtifactFile(file)) continue;
            findings.push({
                type: 'build-artifact',
                kind: 'file',
                path: file.relativePath,
                reason: this.reasonForFile(file),
                sizeBytes: file.size,
                fileCount: 1,
                confidence: file.ext === '.log' ? 'medium' : 'high',
                action: 'review-before-delete',
                severity: 'low',
                category: this.categoryForFile(file)
            });
        }

        const safeFindings = findings.filter((finding) => finding.action === 'safe-to-delete');
        const reviewFindings = findings.filter((finding) => finding.action === 'review-before-delete');

        return {
            scanner: 'build-artifacts',
            findings,
            summary: {
                artifactDirectories: directoryFindings.length,
                artifactFiles: reviewFindings.length,
                reclaimableBytes: findings.reduce((sum, finding) => sum + (finding.sizeBytes || 0), 0),
                safeToDeleteBytes: safeFindings.reduce((sum, finding) => sum + (finding.sizeBytes || 0), 0),
                reviewBeforeDeleteBytes: reviewFindings.reduce((sum, finding) => sum + (finding.sizeBytes || 0), 0)
            }
        };
    }

    matchesArtifactFile(file) {
        if (this.patterns.extensions.includes(file.ext)) return true;
        return this.patterns.files.some((pattern) => matchesGlobPattern(file.name, pattern));
    }

    reasonForFile(file) {
        if (file.ext === '.log') return 'Log file';
        if (file.ext === '.exe') return 'Binary executable';
        if (this.patterns.extensions.includes(file.ext)) {
            return `Generated extension ${file.ext}`;
        }
        return 'Build artifact filename pattern';
    }

    categoryForFile(file) {
        if (file.ext === '.log') return 'logs';
        if (file.ext === '.exe') return 'binaries';
        if (file.ext === '.map') return 'source-maps';
        return 'generated-files';
    }
}

module.exports = {
    BuildArtifactScanner
};
