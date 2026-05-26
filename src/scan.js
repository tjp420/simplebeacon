/**
 * Scan workspace mock/sample data directories for fiction, schema drift, and leaks.
 */

const fs = require('fs');
const path = require('path');
const {
    validateSampleSchema,
    hashFileContent,
    findDuplicateContentGroups
} = require('./lib/mock-data-schema-validator');
const { PAGE_SAMPLE_SPECS } = require('./lib/page-sample-specs');
const { resolveSampleFilePath } = require('./lib/sample-path-resolver');
const { validateRoadmapFiles } = require('./lib/roadmap-json-specs');
const { checkSampleConsistency } = require('./lib/sample-consistency-checker');
const { scanCredentialPatterns } = require('./lib/credential-pattern-scanner');
const { scanProductionLeaks } = require('./rules/production-leak');
const { scanSourceFictionPatterns } = require('./rules/fiction-kpi-patterns');
const { checkJestBaseline } = require('./rules/jest-baseline');
const { loadSimplebeaconConfig, resolveScanPaths, isRuleEnabled, getRuleOptions } = require('./config');
const { resolvePlatformRoot } = require('./project-detect');
const { countRepositoryInventory } = require('./lib/repository-inventory');
const { normalizePathKey } = require('./lib/path-utils');
const { sanitizePath } = require('./lib/path-sanitizer');

const EXT_CATEGORIES = {
    '.json': 'JSON Files',
    '.csv': 'CSV Files',
    '.xml': 'XML Files',
    '.sql': 'Database Files',
    '.db': 'Database Files',
    '.sqlite': 'Database Files',
    '.yaml': 'Config Files',
    '.yml': 'Config Files',
    '.txt': 'Text Files',
    '.md': 'Documentation Files'
};

const INFORMATIONAL_ISSUE_TYPES = new Set([
    'Legacy Fiction Roadmap',
    'Oversized Roadmap File'
]);

function dedupeScannedFiles(files) {
    const seen = new Set();
    const unique = [];
    for (const file of files) {
        const key = normalizePathKey(file.path);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(file);
    }
    return unique;
}

function displayRelativePath(baseDir, filePath) {
    return path.relative(baseDir, filePath).replace(/\\/g, '/');
}

function resolveEffectiveScanPaths(scanRoot, platformRoot, config, extraPaths = []) {
    const scanKey = normalizePathKey(scanRoot);
    const platformKey = normalizePathKey(platformRoot);

    if (scanKey === platformKey) {
        return resolveScanPaths(platformRoot, config, extraPaths);
    }
    if (scanKey.startsWith(`${platformKey}/`)) {
        return [scanRoot];
    }
    if (platformKey.startsWith(`${scanKey}/`)) {
        return resolveScanPaths(platformRoot, config, extraPaths);
    }
    return resolveScanPaths(platformRoot, config, [scanRoot, ...(extraPaths || [])]);
}

function computeFilesAnalyzed(mockCount, credentialScan, productionLeakScan, sourceFictionScan) {
    const summed = (mockCount || 0)
        + (credentialScan?.scanned || 0)
        + (productionLeakScan?.scanned || 0)
        + (sourceFictionScan?.scanned || 0);
    return Math.max(
        mockCount || 0,
        credentialScan?.scanned || 0,
        productionLeakScan?.scanned || 0,
        sourceFictionScan?.scanned || 0,
        summed
    );
}

async function walkFiles(dir, results = [], depth = 0) {
    if (depth > 6) return results;
    let entries;
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (['node_modules', '.git', 'uploads', 'coverage'].includes(entry.name)) continue;
            await walkFiles(fullPath, results, depth + 1);
            continue;
        }
        if (!entry.isFile()) continue;
        try {
            const stat = await fs.promises.stat(fullPath);
            results.push({
                path: fullPath,
                name: entry.name,
                ext: path.extname(entry.name).toLowerCase(),
                size: stat.size
            });
        } catch {
            /* skip unreadable files */
        }
    }
    return results;
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
    }
    return `${size.toFixed(unit === 0 ? 0 : 1)}${units[unit]}`;
}

async function readJsonFile(filePath) {
    try {
        const raw = await fs.promises.readFile(filePath, 'utf8');
        if (!raw.trim()) {
            return { valid: false, issue: 'empty file', raw };
        }
        const payload = JSON.parse(raw);
        return { valid: true, payload, raw };
    } catch (error) {
        return { valid: false, issue: error.message, raw: null };
    }
}

function categoryForExt(ext) {
    return EXT_CATEGORIES[ext] || 'Other Files';
}

function isBlockingIssue(issue) {
    return !INFORMATIONAL_ISSUE_TYPES.has(issue.type);
}

function groupIssues(issues) {
    const grouped = new Map();

    for (const issue of issues) {
        const key = issue.id
            ? `${issue.severity}|${issue.type}|${issue.id}`
            : `${issue.severity}|${issue.type}|${issue.description}`;
        const existing = grouped.get(key);
        if (existing) {
            existing.count += 1;
            const nextSeverity = issue.severityBand || issue.severity;
            if (nextSeverity === 'critical' || (nextSeverity === 'high' && existing.severity !== 'critical')) {
                existing.severity = nextSeverity;
                existing.severityBand = nextSeverity;
            }
            for (const fileName of issue.affectedFiles || []) {
                if (!existing.affectedFiles.includes(fileName)) {
                    existing.affectedFiles.push(fileName);
                }
            }
            for (const filePath of issue.filePaths || issue.metadata?.duplicatePaths || []) {
                if (!existing.filePaths.includes(filePath)) {
                    existing.filePaths.push(filePath);
                }
            }
        } else {
            grouped.set(key, {
                severity: issue.severityBand || issue.severity,
                severityBand: issue.severityBand || issue.severity,
                type: issue.type,
                count: 1,
                description: issue.description,
                pattern: issue.pattern || issue.metadata?.patternId || null,
                line: issue.line || issue.metadata?.line || null,
                recommendation: issue.recommendation || issue.recommendedAction || null,
                recommendedAction: issue.recommendedAction || issue.recommendation,
                affectedFiles: [...(issue.affectedFiles || [])],
                filePaths: [
                    ...(issue.filePaths || issue.metadata?.duplicatePaths || (issue.filePath ? [issue.filePath] : []))
                ]
            });
        }
    }

    return [...grouped.values()].map((item) => ({
        ...item,
        file: item.filePaths?.[0] || item.affectedFiles?.[0] || null,
        affectedFiles: item.affectedFiles.slice(0, 8)
    }));
}

function countBySeverity(issues) {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const issue of issues) {
        const severityBand = issue.severityBand || issue.severity;
        if (counts[severityBand] != null) {
            counts[severityBand] += issue.count || 1;
        } else if (counts[issue.severity] != null) {
            counts[issue.severity] += issue.count || 1;
        }
    }
    return counts;
}

function applyPageSampleValidation({
    fileName,
    filePath,
    parsed,
    issues,
    categories,
    schemaStats
}) {
    schemaStats.schemaChecked += 1;
    schemaStats.pageSampleSchemaChecked += 1;
    const category = categoryForExt(path.extname(fileName));
    const bucket = categories.get(category) || {
        category,
        fileCount: 0,
        totalSize: 0,
        issues: 0,
        files: []
    };

    const schema = validateSampleSchema(fileName, parsed.payload);
    if (schema.valid) {
        schemaStats.schemaPassed += 1;
        schemaStats.pageSampleSchemaPassed += 1;
        categories.set(category, bucket);
        return;
    }

    bucket.issues += 1;
    issues.push({
        id: `schema-${fileName}`,
        severity: 'high',
        type: 'Schema Violation',
        filePath,
        count: schema.violations.length,
        description: `${fileName}: ${schema.violations.map((v) => v.message).join('; ')}`,
        recommendedAction: 'Update mock data to conform to dashboard page schema requirements',
        affectedFiles: [fileName],
        metadata: {
            missingFields: schema.missingFields,
            specFile: fileName,
            violations: schema.violations
        }
    });
    categories.set(category, bucket);
}

async function scanMockDataDirectories(baseDir, extraPaths = [], options = {}) {
    const scanRoot = sanitizePath(baseDir, baseDir);
    const { platformRoot } = resolvePlatformRoot(scanRoot);
    const root = platformRoot;
    const config = options.config || loadSimplebeaconConfig(root, options.configPath);
    if (options.withJest && config.rules?.['jest-baseline']) {
        config.rules['jest-baseline'] = { ...config.rules['jest-baseline'], enabled: true, runTests: true };
    }
    const sanitizedExtraPaths = (extraPaths || [])
        .map((entry) => sanitizePath(entry, scanRoot))
        .filter(Boolean);
    const scanPaths = resolveEffectiveScanPaths(scanRoot, root, config, sanitizedExtraPaths);
    const schemaEnabled = isRuleEnabled(config, 'json-schema');
    const inventoryPromise = countRepositoryInventory(scanRoot, {
        profile: options.inventoryProfile || 'explorer'
    });

    const files = [];
    for (const scanPath of scanPaths) {
        if (fs.existsSync(scanPath)) {
            await walkFiles(scanPath, files);
        }
    }
    const uniqueFiles = dedupeScannedFiles(files);

    const categories = new Map();
    const issues = [];
    const hashEntries = [];
    let invalidJson = 0;
    let emptyFiles = 0;
    const pageSamplesValidated = new Set();
    const schemaStats = {
        schemaChecked: 0,
        schemaPassed: 0,
        pageSampleSchemaChecked: 0,
        pageSampleSchemaPassed: 0
    };

    for (const file of uniqueFiles) {
        const category = categoryForExt(file.ext);
        const bucket = categories.get(category) || {
            category,
            fileCount: 0,
            totalSize: 0,
            issues: 0,
            files: []
        };
        bucket.fileCount += 1;
        bucket.totalSize += file.size;
        bucket.files.push(file.name);

        if (file.ext === '.json') {
            const parsed = await readJsonFile(file.path);
            if (!parsed.valid) {
                bucket.issues += 1;
                invalidJson += 1;
                if (parsed.issue === 'empty file') emptyFiles += 1;
                issues.push({
                    id: `invalid-json-${file.name}`,
                    severity: parsed.issue === 'empty file' ? 'low' : 'high',
                    type: parsed.issue === 'empty file' ? 'Empty File' : 'Invalid JSON',
                    filePath: file.path,
                    count: 1,
                    description: `${file.name}: ${parsed.issue}`,
                    recommendedAction: parsed.issue === 'empty file'
                        ? 'Remove or populate empty mock files'
                        : 'Fix JSON syntax errors in mock data',
                    affectedFiles: [file.name]
                });
            } else {
                hashEntries.push({
                    name: file.name,
                    path: file.path,
                    contentHash: hashFileContent(parsed.raw)
                });

                if (schemaEnabled && file.name.endsWith('-sample.json') && PAGE_SAMPLE_SPECS[file.name]) {
                    pageSamplesValidated.add(file.name);
                    applyPageSampleValidation({
                        fileName: file.name,
                        filePath: file.path,
                        parsed,
                        issues,
                        categories,
                        schemaStats
                    });
                }
            }
        }

        categories.set(category, bucket);
    }

    let pageSpecsFromAlias = 0;
    if (schemaEnabled) {
        const pageSpecsBeforeAlias = schemaStats.pageSampleSchemaChecked;
        for (const fileName of Object.keys(PAGE_SAMPLE_SPECS)) {
            if (pageSamplesValidated.has(fileName)) continue;
            const filePath = resolveSampleFilePath(root, fileName);
            if (!fs.existsSync(filePath)) continue;
            const parsed = await readJsonFile(filePath);
            if (!parsed.valid) {
                invalidJson += 1;
                if (parsed.issue === 'empty file') emptyFiles += 1;
                issues.push({
                    id: `invalid-json-${fileName}`,
                    severity: parsed.issue === 'empty file' ? 'low' : 'high',
                    type: parsed.issue === 'empty file' ? 'Empty File' : 'Invalid JSON',
                    filePath,
                    count: 1,
                    description: `${fileName}: ${parsed.issue}`,
                    recommendedAction: parsed.issue === 'empty file'
                        ? 'Remove or populate empty mock files'
                        : 'Fix JSON syntax errors in mock data',
                    affectedFiles: [fileName]
                });
                continue;
            }
            pageSamplesValidated.add(fileName);
            applyPageSampleValidation({
                fileName,
                filePath,
                parsed,
                issues,
                categories,
                schemaStats
            });
        }
        pageSpecsFromAlias = schemaStats.pageSampleSchemaChecked - pageSpecsBeforeAlias;
    }

    const duplicateGroups = findDuplicateContentGroups(hashEntries);
    for (const group of duplicateGroups) {
        const relativePaths = group.map((entry) => displayRelativePath(root, entry.path));
        issues.push({
            id: `duplicate-${group[0].contentHash.slice(0, 8)}`,
            severity: 'low',
            type: 'Duplicate Data',
            filePath: group[0].path,
            filePaths: group.map((entry) => entry.path),
            count: group.length,
            description: `${group.length} files share identical JSON content`,
            recommendedAction: 'Remove duplicate entries to optimize data size',
            affectedFiles: relativePaths,
            metadata: {
                duplicatePaths: group.map((entry) => entry.path),
                relativePaths,
                contentHash: group[0].contentHash
            }
        });
    }

    let roadmapValidation = { checked: 0, passed: 0, issues: [] };
    if (isRuleEnabled(config, 'roadmap')) {
        roadmapValidation = await validateRoadmapFiles(root, { baseline: config.baseline });
        schemaStats.schemaChecked += roadmapValidation.checked;
        schemaStats.schemaPassed += roadmapValidation.passed;
        issues.push(...roadmapValidation.issues);
    }

    let consistency = { checked: 0, passed: 0, score: null, issues: [] };
    if (isRuleEnabled(config, 'sample-consistency')) {
        consistency = await checkSampleConsistency(root, {
            sampleDir: config.sampleDir,
            baseline: config.baseline,
            anchorSamples: config.consistencyAnchorSamples,
            scanPathFiles: uniqueFiles.filter((file) => file.ext === '.json'),
            fictionScope: options.fictionScope || 'repository-json',
            ignoreGlobs: config.ignore
        });
        issues.push(...consistency.issues);
    }

    let credentialScan = { scanned: 0, findings: 0, issues: [] };
    if (isRuleEnabled(config, 'credentials')) {
        const credOpts = getRuleOptions(config, 'credentials');
        credentialScan = await scanCredentialPatterns(uniqueFiles, {
            scanProduction: credOpts.scanProduction !== false,
            baseDir: root,
            productionPaths: credOpts.productionPaths || config.productionPaths,
            ignoreGlobs: config.ignore
        });
        issues.push(...credentialScan.issues);
    }

    let productionLeakScan = { scanned: 0, findings: 0, issues: [] };
    if (isRuleEnabled(config, 'production-leak')) {
        const leakOpts = getRuleOptions(config, 'production-leak');
        productionLeakScan = await scanProductionLeaks(root, {
            productionPaths: leakOpts.productionPaths || config.productionPaths,
            ignoreGlobs: leakOpts.ignoreGlobs || config.ignore,
            allowlistFiles: leakOpts.allowlistFiles || [],
            scannerMetaFiles: config.scannerMetaFiles || [],
            severity: leakOpts.severity || 'high'
        });
        issues.push(...productionLeakScan.issues);
    }

    let sourceFictionScan = { scanned: 0, findings: 0, issues: [], patterns: [] };
    if (isRuleEnabled(config, 'fiction-kpi-patterns')) {
        const fictionOpts = getRuleOptions(config, 'fiction-kpi-patterns');
        sourceFictionScan = await scanSourceFictionPatterns(root, {
            sourcePaths: fictionOpts.sourcePaths || config.sourceCodeScanPaths,
            ignoreGlobs: fictionOpts.ignoreGlobs || config.ignore,
            pathExclusions: config.pathExclusions || [],
            baseline: config.baseline
        });
        const severity = fictionOpts.severity || 'medium';
        for (const issue of sourceFictionScan.issues) {
            issue.severity = severity;
        }
        issues.push(...sourceFictionScan.issues);
    }

    let jestBaseline = { checked: false, passed: true, issues: [], summary: null };
    if (isRuleEnabled(config, 'jest-baseline')) {
        const jestOpts = getRuleOptions(config, 'jest-baseline');
        jestBaseline = await checkJestBaseline(root, {
            baseline: config.baseline,
            runTests: jestOpts.runTests === true,
            testCommand: jestOpts.testCommand,
            timeoutMs: jestOpts.timeoutMs
        });
        issues.push(...jestBaseline.issues);
    }

    const totalSize = uniqueFiles.reduce((sum, file) => sum + file.size, 0);
    const issueCount = issues
        .filter(isBlockingIssue)
        .reduce((sum, issue) => sum + (issue.count || 1), 0);
    const qualityScore = uniqueFiles.length
        ? Math.max(55, Math.min(100, Math.round(100 - (issues.length / Math.max(uniqueFiles.length, 1)) * 25)))
        : 0;
    const schemaCompliance = schemaStats.schemaChecked
        ? Math.round((schemaStats.schemaPassed / schemaStats.schemaChecked) * 100)
        : null;

    const mockDataCategories = [...categories.values()].map((cat) => ({
        category: cat.category,
        fileCount: cat.fileCount,
        totalSize: formatBytes(cat.totalSize),
        qualityScore: Math.max(60, Math.min(99, Math.round(100 - (cat.issues / Math.max(cat.fileCount, 1)) * 40))),
        issues: cat.issues,
        confidence: null,
        description: `${cat.category} discovered during filesystem scan`
    }));

    const rawIssues = issues;
    const severityCounts = countBySeverity(rawIssues);
    const repositoryInventory = await inventoryPromise;
    const ruleScopedFilesAnalyzed = computeFilesAnalyzed(
        uniqueFiles.length,
        credentialScan,
        productionLeakScan,
        sourceFictionScan
    );
    const repositoryFilesTotal = repositoryInventory?.totalFiles ?? null;
    const repositoryFoldersTotal = repositoryInventory?.totalFolders ?? null;
    const rulesEnabled = Object.keys(config.rules || {}).filter((name) => isRuleEnabled(config, name));
    const pageSpecCatalogSize = Object.keys(PAGE_SAMPLE_SPECS).length;
    const scanScope = {
        profile: config.profile || 'standard',
        scannerVersion: '1.0.0',
        rulesEnabled,
        gatePolicy: config.gate || { failOn: ['high'], warnOn: ['medium', 'low'] },
        mockSampleFilesInScanPaths: uniqueFiles.length,
        pageSpecCatalogSize,
        pageSpecsValidated: schemaStats.pageSampleSchemaChecked,
        pageSpecsFromScanPaths: schemaStats.pageSampleSchemaChecked - pageSpecsFromAlias,
        pageSpecsFromAliasPaths: pageSpecsFromAlias,
        productionDirsScanned: productionLeakScan.scanned,
        productionPaths: config.productionPaths || [],
        sourceCodeScanPaths: config.sourceCodeScanPaths || [],
        sourceCodeFilesScanned: sourceFictionScan.scanned,
        sourceFictionPatternHits: sourceFictionScan.findings,
        jestExecutedDuringScan: jestBaseline.checked === true,
        consistencyAnchorCount: (config.consistencyAnchorSamples || []).length,
        fictionScope: consistency.scope || 'repository-json',
        fictionJsonFilesScanned: consistency.jsonFilesScanned ?? consistency.checked ?? 0,
        fictionSampleFilesScanned: consistency.samplesScanned ?? 0,
        ruleScopedFilesAnalyzed,
        repositoryFilesTotal,
        repositoryFoldersTotal,
        limitations: [
            repositoryFilesTotal != null
                ? `Repository inventory: ${repositoryFilesTotal.toLocaleString()} files — gate rules checked ${ruleScopedFilesAnalyzed} (mock paths, credentials, server/ leaks).`
                : `Gate rules checked ${ruleScopedFilesAnalyzed} files — mock paths, credentials, and production directories only.`,
            'Pattern matching on JSON samples and server/ production paths — not LLM semantic review.',
            consistency.scope === 'repository-json'
                ? `Fiction/KPI rules scan repository JSON (${consistency.jsonFilesScanned ?? '—'}) plus source code (${sourceFictionScan.scanned ?? 0} files in ${(config.sourceCodeScanPaths || []).join(', ') || 'configured paths'}).`
                : 'Fiction/KPI rules scan configured sample JSON paths only.',
            jestBaseline.checked
                ? 'Jest was executed during this scan.'
                : 'Jest was not executed during this scan — use npm test or simplebeacon:full for live test verification.',
            config.profile === 'cascade'
                ? 'Cascade profile scans server/ for production leaks — src/ stub API is excluded by design.'
                : null
        ].filter(Boolean)
    };

    return {
        type: 'simplebeacon-report',
        reportVersion: 2,
        generatedAt: new Date().toISOString(),
        generatedBy: 'Simplebeacon',
        projectRoot: scanRoot,
        platformRoot: platformRoot !== scanRoot ? platformRoot : undefined,
        configPath: config.configPath,
        scanPaths,
        repositoryInventory,
        mockSampleFiles: uniqueFiles.length,
        totalFiles: uniqueFiles.length,
        ruleScopedFilesAnalyzed,
        repositoryFilesTotal,
        repositoryFoldersTotal,
        filesAnalyzed: repositoryFilesTotal ?? ruleScopedFilesAnalyzed,
        totalSizeBytes: totalSize,
        totalSizeLabel: formatBytes(totalSize),
        issueCount,
        invalidJson,
        emptyFiles,
        qualityScore,
        schemaCompliance,
        schemaChecked: schemaStats.schemaChecked,
        schemaPassed: schemaStats.schemaPassed,
        pageSampleSchemaChecked: schemaStats.pageSampleSchemaChecked,
        pageSampleSchemaPassed: schemaStats.pageSampleSchemaPassed,
        duplicateGroups: duplicateGroups.length,
        roadmapSchemaChecked: roadmapValidation.checked,
        roadmapSchemaPassed: roadmapValidation.passed,
        consistencyChecked: consistency.checked,
        consistencyPassed: consistency.passed,
        consistencyScore: consistency.score,
        fictionJsonFilesScanned: consistency.jsonFilesScanned ?? consistency.checked ?? 0,
        fictionSampleFilesScanned: consistency.samplesScanned ?? 0,
        fictionScope: consistency.scope || 'repository-json',
        credentialScanned: credentialScan.scanned,
        credentialFindings: credentialScan.findings,
        productionLeakScanned: productionLeakScan.scanned,
        productionLeakFindings: productionLeakScan.findings,
        sourceCodeFilesScanned: sourceFictionScan.scanned,
        sourceFictionPatternHits: sourceFictionScan.findings,
        jestBaselineChecked: jestBaseline.checked,
        jestBaselinePassed: jestBaseline.passed,
        jestSummary: jestBaseline.summary || null,
        severityCounts,
        mockDataCategories,
        detectedIssues: groupIssues(issues).slice(0, 12),
        rawIssues,
        sampleFiles: uniqueFiles.map((f) => f.name),
        scanScope
    };
}

async function runScan(baseDir, options = {}) {
    const scan = await scanMockDataDirectories(baseDir, options.extraPaths || [], options);
    return scan;
}

module.exports = {
    runScan,
    scanMockDataDirectories,
    formatBytes,
    categoryForExt,
    validateSampleSchema,
    groupIssues,
    isBlockingIssue,
    countBySeverity,
    resolveEffectiveScanPaths,
    computeFilesAnalyzed
};
