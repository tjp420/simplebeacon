/**
 * Basic static analysis for files with zero incoming references.
 */

const fs = require('fs');
const path = require('path');
const { walkProjectFiles } = require('./utils/project-walker');
const { parseImports, JS_SOURCE_EXTENSIONS } = require('./utils/import-parser');
const { parseNonCodeReferences, addReference } = require('./utils/file-reference-tracker');
const { buildDependencyGraph, findUnreferencedNodes } = require('./utils/dependency-graph-builder');
const { globMatch } = require('../../rules/production-leak');

const SOURCE_EXTENSIONS = new Set([
    ...JS_SOURCE_EXTENSIONS,
    '.py',
    '.html',
    '.htm',
    '.css',
    '.scss',
    '.json'
]);

const ENTRY_BASENAMES = new Set([
    'index.js',
    'index.ts',
    'index.mjs',
    'main.js',
    'main.ts',
    'app.js',
    'server.js'
]);

const PROTECTED_BASENAMES = new Set([
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'jsconfig.json',
    'README.md',
    'LICENSE',
    '.gitignore'
]);

const DEFAULT_SKIP_PATH_PATTERNS = [
    /(?:^|\/)github-cache\//,
    /(?:^|\/)node_modules\//,
    /(?:^|\/)coverage\//,
    /(?:^|\/)archive\//,
    /(?:^|\/)temp\//,
    /(?:^|\/)\\.simplebeacon\//,
    /(?:^|\/)simplebeacon-test-repo\//,
    /(?:^|\/)\\.cursor(?:\/|$)/,
    /(?:^|\/)\\.vscode(?:\/|$)/,
    /(?:^|\/)docs\//,
    /(?:^|\/)reports\//,
    /(?:^|\/)deliverables\//,
    /(?:^|\/)security-reports\//,
    /(?:^|\/)tests-legacy(?:\/|$)/,
    /(?:^|\/)\\.github-sync(?:\/|$)/,
    /(?:^|\/)data-central\//,
    /(?:^|\/)web\/data\//,
    /(?:^|\/)data\//,
    /(?:^|\/)coming-soon\//,
    /(?:^|\/)deployments\//,
    /(?:^|\/)public\//,
    /(?:^|\/)functions\//,
    /(?:^|\/)cloudflare-deploy\//,
    /(?:^|\/)packages\/simplebeacon-cli\/docs\//,
    /(?:^|\/)templates\//,
    /(?:^|\/)src\/web\/export-system\.js$/
];

const DEFAULT_SKIP_GLOBS = [
    '**/*-sample.json',
    '**/mock-backend.js',
    '**/mock-backend-static-data.js',
    '**/demo-users.json',
    '**/sample-audit-report-data.js',
    '**/trust-verification.json',
    'website-51543.html',
    'development-roadmap-51543.html',
    '.cursor/**',
    '**/.vscode/**',
    '**/.eslintrc*.json',
    '**/mock_data_*',
    '**/mock_data_*.py',
    '**/mock_data_*.json',
    '**/batch_consolidator.py',
    '**/standardized_schema.json',
    '**/complete-scan-export.json',
    '**/complete-scan-export.enriched.json',
    'tests-legacy/**',
    '.github-sync/**'
];

const PROTECTED_RUNTIME_BASENAMES = new Set([
    'mock-backend.js',
    'mock-backend-static-data.js',
    'demo-users.json',
    'sample-audit-report-data.js',
    'mock_data_validation_report.json',
    'dashboard_config.json',
    'central-data-config.json',
    '.eslintrc.security.json',
    // Intentional CJS / browser mirrors (see complete-scan-artifact-profile.js)
    'complete-scan-artifact-profile.browser.js'
]);

const SCRIPT_ENTRY_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.py']);
const CONFIG_ENTRY_NAMES = new Set([
    'jest.config.js',
    'jest.critical-path.config.js',
    'vite.config.js',
    'webpack.config.js',
    'eslint.config.js'
]);

const NPM_NODE_SCRIPT_PATTERN = /\bnode\s+(?:--[^\s]+\s+)*([^\s&|;]+)/g;
const NPM_PYTHON_SCRIPT_PATTERN = /\bpython(?:3)?\s+(?:-[^\s]+\s+)*([^\s&|;]+)/gi;

/** Installed dependency trees — never treat as app entry points or orphan scan targets. */
const VENDOR_PATH_PATTERN = /(?:^|\/)node_modules(?:\/|$)/;

function normalizeRelativePath(relativePath) {
    return relativePath.split(path.sep).join('/');
}

function isVendorPath(relativePath) {
    return VENDOR_PATH_PATTERN.test(normalizeRelativePath(relativePath));
}

class UnusedFileDetector {
    constructor(config = {}) {
        this.sourceExtensions = new Set(config.sourceExtensions || SOURCE_EXTENSIONS);
        this.protectedBasenames = new Set(config.protectedBasenames || PROTECTED_BASENAMES);
        this.entryBasenames = new Set(config.entryBasenames || ENTRY_BASENAMES);
        this.skipPathPatterns = config.skipPathPatterns || DEFAULT_SKIP_PATH_PATTERNS;
        this.skipGlobs = config.skipGlobs || DEFAULT_SKIP_GLOBS;
    }

    async scan(projectRoot, options = {}) {
        const inventory = options.inventory || await walkProjectFiles(projectRoot, options);
        const sourceFiles = inventory.files.filter(
            (file) => this.sourceExtensions.has(file.ext) && !isVendorPath(file.relativePath)
        );
        const imports = [];
        const referenceMap = new Map();

        for (const file of sourceFiles) {
            let content = '';
            try {
                content = await fs.promises.readFile(file.path, 'utf8');
            } catch {
                continue;
            }
            imports.push(...parseImports(file.path, content, inventory.root));
            for (const ref of parseNonCodeReferences(file.path, content, inventory.root)) {
                if (ref.resolvedPath) {
                    addReference(referenceMap, ref.resolvedPath, ref.source);
                }
            }
        }

        for (const entry of imports) {
            if (entry.resolvedPath) {
                addReference(referenceMap, entry.resolvedPath, entry.source);
            }
        }

        const graph = buildDependencyGraph(imports, inventory.root);
        const entryPoints = this.collectEntryPoints(inventory, graph);
        const unreferencedNodes = findUnreferencedNodes(graph, entryPoints);

        const unusedFromGraph = unreferencedNodes
            .filter((node) => this.isCandidate(node.relativePath))
            .map((node) => ({
                type: 'unused-file',
                path: node.relativePath,
                reason: 'Zero incoming import references',
                confidence: 'medium',
                action: 'review-before-delete',
                severity: 'medium'
            }));

        const referencedPaths = new Set(referenceMap.keys());
        for (const [targetPath] of graph.entries()) {
            referencedPaths.add(targetPath);
        }
        for (const entry of entryPoints) {
            referencedPaths.add(path.resolve(entry));
        }

        const orphanFiles = sourceFiles
            .filter((file) => !referencedPaths.has(path.resolve(file.path)))
            .filter((file) => !entryPoints.some((entry) => path.resolve(entry) === path.resolve(file.path)))
            .filter((file) => this.isCandidate(file.relativePath))
            .map((file) => ({
                type: 'unused-file',
                path: file.relativePath,
                reason: 'Not referenced by static import graph',
                confidence: 'low',
                action: 'review-before-delete',
                severity: 'medium'
            }));

        const findings = dedupeFindings([...unusedFromGraph, ...orphanFiles]);

        return {
            scanner: 'unused-files',
            findings,
            summary: {
                sourceFilesScanned: sourceFiles.length,
                entryPoints: entryPoints.length,
                unusedCandidates: findings.length
            },
            metadata: {
                entryPoints: entryPoints.map((entry) => path.relative(inventory.root, entry).split(path.sep).join('/'))
            }
        };
    }

    collectEntryPoints(inventory, graph) {
        const entries = new Set();

        for (const file of inventory.files) {
            const rel = normalizeRelativePath(file.relativePath);
            if (isVendorPath(rel)) {
                continue;
            }

            if (this.entryBasenames.has(file.name.toLowerCase())) {
                entries.add(file.path);
            }
            if (/(?:^|\/)bin\//.test(rel)) {
                entries.add(file.path);
            }
            if (/(?:^|\/)scripts\//.test(rel) && SCRIPT_ENTRY_EXTENSIONS.has(file.ext)) {
                entries.add(file.path);
            }
            if (/(?:^|\/)tools\//.test(rel) && SCRIPT_ENTRY_EXTENSIONS.has(file.ext)) {
                entries.add(file.path);
            }
            if (/eslint\.config\.(js|cjs|mjs)$/i.test(file.name)) {
                entries.add(file.path);
            }
            if (CONFIG_ENTRY_NAMES.has(file.name.toLowerCase())) {
                entries.add(file.path);
            }
            if (/-server\.js$/i.test(file.name) || /^server-.+\.js$/i.test(file.name)) {
                entries.add(file.path);
            }
            if (file.name.toLowerCase() === 'index.html') {
                entries.add(file.path);
            }
            if (/\.html$/i.test(file.name) && /(?:^|\/)website-51543\.html$|(?:^|\/)development-roadmap-51543\.html$/i.test(rel)) {
                entries.add(file.path);
            }
            if (/(?:^|\/)packages\/simplebeacon-cli\/(?:bin|src\/reporters|src\/rules)\//.test(rel)
                && SCRIPT_ENTRY_EXTENSIONS.has(file.ext)) {
                entries.add(file.path);
            }
        }

        for (const packageJsonPath of inventory.files.filter(
            (file) => file.name === 'package.json' && !isVendorPath(file.relativePath)
        )) {
            entries.add(packageJsonPath.path);
            const packageDir = path.dirname(packageJsonPath.path);
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath.path, 'utf8'));
                if (pkg.main) {
                    entries.add(path.resolve(packageDir, pkg.main));
                }
                if (pkg.bin && typeof pkg.bin === 'object') {
                    for (const binPath of Object.values(pkg.bin)) {
                        entries.add(path.resolve(packageDir, binPath));
                    }
                }
                if (pkg.scripts && typeof pkg.scripts === 'object') {
                    for (const scriptCommand of Object.values(pkg.scripts)) {
                        if (typeof scriptCommand !== 'string') continue;
                        for (const target of extractNpmScriptTargets(scriptCommand, packageDir)) {
                            entries.add(target);
                        }
                    }
                }
            } catch {
                /* ignore invalid package.json */
            }
        }

        for (const node of graph.values()) {
            const rel = path.relative(inventory.root, node.path).split(path.sep).join('/');
            if (isVendorPath(rel)) {
                continue;
            }
            if (node.importedBy.length === 0 && this.entryBasenames.has(path.basename(node.path).toLowerCase())) {
                entries.add(node.path);
            }
        }

        return [...entries];
    }

    isCandidate(relativePath) {
        const normalized = relativePath.split(path.sep).join('/');
        if (this.skipPathPatterns.some((pattern) => pattern.test(normalized))) {
            return false;
        }
        if (this.skipGlobs.some((pattern) => globMatch(normalized, pattern))) {
            return false;
        }

        const basename = path.basename(relativePath);
        if (this.protectedBasenames.has(basename)) return false;
        if (PROTECTED_RUNTIME_BASENAMES.has(basename)) return false;
        if (/\.(test|spec)\.[jt]s$/i.test(basename)) return false;
        if (/(?:^|\/)(?:tests|test)(?:\/|$)/.test(normalized)) return false;
        return true;
    }
}

function extractNpmScriptTargets(scriptCommand, packageDir) {
    const targets = [];
    for (const pattern of [NPM_NODE_SCRIPT_PATTERN, NPM_PYTHON_SCRIPT_PATTERN]) {
        pattern.lastIndex = 0;
        let match = pattern.exec(scriptCommand);
        while (match) {
            const candidate = path.resolve(packageDir, match[1]);
            if (fs.existsSync(candidate)) {
                targets.push(candidate);
            }
            match = pattern.exec(scriptCommand);
        }
    }
    return targets;
}

function dedupeFindings(findings) {
    const seen = new Set();
    const unique = [];
    for (const finding of findings) {
        if (seen.has(finding.path)) continue;
        seen.add(finding.path);
        unique.push(finding);
    }
    return unique;
}

module.exports = {
    UnusedFileDetector,
    dedupeFindings,
    isVendorPath,
    normalizeRelativePath,
    DEFAULT_SKIP_GLOBS
};
