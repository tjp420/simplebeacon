/**
 * Extract static import/require references from source files.
 */

const path = require('path');
const fs = require('fs');

const JS_SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

const JS_PATTERNS = [
    { kind: 'esm', regex: /import\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]/g },
    { kind: 'cjs', regex: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g },
    { kind: 'dynamic', regex: /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g }
];

const PY_PATTERNS = [
    { kind: 'py-import', regex: /^\s*import\s+([a-zA-Z0-9_.]+)/gm },
    { kind: 'py-from', regex: /^\s*from\s+([a-zA-Z0-9_.]+)\s+import/mg }
];

function extractMatches(content, regex) {
    const matches = [];
    let match = regex.exec(content);
    while (match) {
        matches.push(match[1]);
        match = regex.exec(content);
    }
    return matches;
}

function normalizeSpecifier(specifier) {
    if (!specifier) return specifier;
    return specifier.split('?')[0].split('#')[0];
}

function isRelativeSpecifier(specifier) {
    return specifier.startsWith('.') || specifier.startsWith('/');
}

function resolveImport(fromFile, specifier, projectRoot) {
    const normalized = normalizeSpecifier(specifier);
    if (!isRelativeSpecifier(normalized)) {
        return null;
    }
    const baseDir = path.dirname(fromFile);
    const raw = path.resolve(baseDir, normalized);
    const candidates = [
        raw,
        `${raw}.js`,
        `${raw}.mjs`,
        `${raw}.cjs`,
        `${raw}.ts`,
        `${raw}.tsx`,
        `${raw}.jsx`,
        path.join(raw, 'index.js'),
        path.join(raw, 'index.ts')
    ];
    for (const candidate of candidates) {
        if (candidate.startsWith(projectRoot) && fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

function parseJSImports(content, filePath, projectRoot) {
    const imports = [];
    for (const pattern of JS_PATTERNS) {
        for (const specifier of extractMatches(content, pattern.regex)) {
            if (!isRelativeSpecifier(specifier)) continue;
            const resolvedPath = resolveImport(filePath, specifier, projectRoot);
            if (!resolvedPath) continue;
            imports.push({
                kind: pattern.kind,
                specifier,
                source: filePath,
                resolvedPath
            });
        }
    }
    return imports;
}

function parsePythonImports(content, filePath) {
    const imports = [];
    for (const pattern of PY_PATTERNS) {
        for (const moduleName of extractMatches(content, pattern.regex)) {
            imports.push({
                kind: pattern.kind,
                specifier: moduleName,
                source: filePath,
                resolvedPath: null
            });
        }
    }
    return imports;
}

function parseImports(filePath, content, projectRoot) {
    const ext = path.extname(filePath).toLowerCase();
    if (JS_SOURCE_EXTENSIONS.has(ext)) {
        return parseJSImports(content, filePath, projectRoot);
    }
    if (ext === '.py') {
        return parsePythonImports(content, filePath);
    }
    return [];
}

const RUNTIME_REFERENCE_PATTERNS = [
    { kind: 'fetch', regex: /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g },
    { kind: 'fs-readFile', regex: /fs\.(?:promises\.)?readFile(?:Sync)?\s*\(\s*['"`]([^'"`]+)['"`]/g },
    { kind: 'readFileSync', regex: /readFileSync\s*\(\s*['"`]([^'"`]+)['"`]/g },
    { kind: 'createReadStream', regex: /createReadStream\s*\(\s*['"`]([^'"`]+)['"`]/g }
];

function resolveRuntimePath(fromFile, specifier, projectRoot) {
    const normalized = normalizeSpecifier(specifier);
    if (!normalized || normalized.startsWith('http://') || normalized.startsWith('https://')) {
        return null;
    }
    if (isRelativeSpecifier(normalized)) {
        return resolveImport(fromFile, normalized, projectRoot);
    }
    return path.join(projectRoot, normalized.split('/').join(path.sep));
}

function parseRuntimeReferences(filePath, content, projectRoot) {
    const ext = path.extname(filePath).toLowerCase();
    if (!JS_SOURCE_EXTENSIONS.has(ext)) {
        return [];
    }

    const references = [];
    for (const pattern of RUNTIME_REFERENCE_PATTERNS) {
        for (const specifier of extractMatches(content, pattern.regex)) {
            references.push({
                kind: pattern.kind,
                specifier,
                source: filePath,
                resolvedPath: resolveRuntimePath(filePath, specifier, projectRoot)
            });
        }
    }
    return references;
}

module.exports = {
    parseImports,
    parseJSImports,
    parsePythonImports,
    parseRuntimeReferences,
    resolveImport,
    normalizeSpecifier,
    JS_SOURCE_EXTENSIONS
};
