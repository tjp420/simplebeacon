/**
 * Load .simplebeacon/config.json and .simplebeacon/baseline.json for a project root.
 */

const fs = require('fs');
const path = require('path');
const { detectProjectProfile, IGNORE_DEFAULTS, CASCADE_ANCHORS, isCascadeMonorepo } = require('./project-detect');
const { validateConfig } = require('./config-schema');
const { ConfigError } = require('./lib/errors');
const { normalizePathKey, assertPathWithinRoot, resolveSafeRelativePath } = require('./lib/path-utils');
const { sanitizeFilePath } = require('./lib/input-sanitizer');

const CASCADE_REJECTED_FICTION = {
    featureCounts: [47, 8, 9],
    completionRates: [74.17, 66, 66.0, 62],
    mockFileCounts: [1247],
    openIssueCounts: [156],
    modelNames: ['unbreakable-oracle', 'demo-oracle'],
    throughputClaims: ['1559', '1,559'],
    aiConfidenceScores: [98.5, 94.3]
};

const GENERIC_REJECTED_FICTION = {
    featureCounts: [47, 100, 156, 8, 9],
    completionRates: [74.17, 87, 94.3, 66, 62],
    mockFileCounts: [1247, 999, 1000],
    openIssueCounts: [156, 999],
    modelNames: ['unbreakable-oracle', 'gpt-5-oracle', 'demo-oracle'],
    throughputClaims: ['1559', '1,559', '9999'],
    aiConfidenceScores: [98.5, 94.3, 87]
};

const DEFAULT_MOCK_SCAN_RELATIVE_PATHS = [
    'web/data',
    'data/mock',
    'data-central/ai-tools/mock-data'
];

const DEFAULT_CONSISTENCY_ANCHOR_SAMPLES = CASCADE_ANCHORS;

const DEFAULT_BASELINE = {
    jestTestsPassing: null,
    jestTestsLabel: null,
    jestSuites: null,
    pageSamplesLabel: null,
    pageSampleSpecCount: null,
    currentRelease: null,
    activeModel: null,
    dataSource: 'repository-audit',
    rejectedFiction: {}
};

const PROFILE_RULES = {
    minimal: {
        credentials: { enabled: true, scanProduction: true },
        'json-schema': { enabled: false },
        'sample-consistency': { enabled: false },
        roadmap: { enabled: false },
        'production-leak': { enabled: true, severity: 'high' },
        'jest-baseline': { enabled: false, runTests: false }
    },
    standard: {
        credentials: { enabled: true, scanProduction: true },
        'json-schema': { enabled: true },
        'sample-consistency': { enabled: true },
        roadmap: { enabled: true },
        'production-leak': { enabled: true, severity: 'high' },
        'jest-baseline': { enabled: false, runTests: false },
        'fiction-kpi-patterns': { enabled: true, severity: 'medium' }
    },
    cascade: {
        credentials: { enabled: true, scanProduction: true },
        'json-schema': { enabled: true },
        'sample-consistency': { enabled: true },
        roadmap: { enabled: true },
        'production-leak': {
            enabled: true,
            severity: 'medium',
            productionPaths: ['server/'],
            allowlistFiles: [
                'server/lib/snapshot-seeds.js',
                'server/lib/snapshot-resolver.js',
                'server/lib/sample-path-resolver.js',
                'server/lib/code-roadmap-generator.js',
                'server/services/model-inference-service.js'
            ]
        },
        'jest-baseline': {
            enabled: false,
            runTests: false,
            testCommand: 'npm test -- --no-coverage --passWithNoTests'
        }
    }
};

const DEFAULT_CONFIG = {
    profile: 'standard',
    scanPaths: DEFAULT_MOCK_SCAN_RELATIVE_PATHS,
    productionPaths: ['server/', 'src/', 'app/', 'lib/'],
    sampleDir: 'web/data',
    consistencyAnchorSamples: DEFAULT_CONSISTENCY_ANCHOR_SAMPLES,
    ignore: IGNORE_DEFAULTS,
    pathExclusions: [], // User-configurable path exclusion tokens
    scannerMetaFiles: [], // User-configurable scanner infrastructure files to exclude
    rules: PROFILE_RULES.standard,
    gate: {
        failOn: ['high'],
        warnOn: ['medium', 'low']
    }
};

function readJsonFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return { ok: true, data: JSON.parse(raw) };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { ok: false, missing: true, error };
        }
        return { ok: false, missing: false, error };
    }
}

function normalizeRelativePath(relativePath) {
    return String(relativePath || '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '');
}

function resolvePathFromBase(baseDir, relativePath) {
    return resolveSafeRelativePath(baseDir, normalizeRelativePath(relativePath), {
        label: relativePath,
        allowOutside: path.isAbsolute(normalizeRelativePath(relativePath))
    });
}

function loadCentralDataConfig(baseDir) {
    const configPath = path.join(baseDir, 'data-central', 'config', 'central-data-config.json');
    const result = readJsonFile(configPath);
    if (!result.ok) return null;
    return result.data?.centralDataTruth || result.data || null;
}

function resolveScanPaths(baseDir, config, extraPaths = []) {
    const truth = loadCentralDataConfig(baseDir);
    const configured = truth?.mockDataScan?.paths;
    const relativePaths = Array.isArray(config?.scanPaths) && config.scanPaths.length
        ? config.scanPaths.map(normalizeRelativePath)
        : Array.isArray(configured) && configured.length
            ? configured.map(normalizeRelativePath)
            : DEFAULT_MOCK_SCAN_RELATIVE_PATHS;

    const rootKey = normalizePathKey(baseDir);
    const resolved = relativePaths
        .map((rel) => resolvePathFromBase(baseDir, rel))
        .filter(Boolean);

    const extras = (extraPaths || [])
        .map((p) => (path.isAbsolute(p) ? p : resolvePathFromBase(baseDir, p)))
        .filter(Boolean)
        .filter((extra) => {
            const extraKey = normalizePathKey(extra);
            if (extraKey === rootKey) return false;
            // Ancestor of scan root (e.g. monorepo parent) re-walks configured child paths.
            if (rootKey.startsWith(`${extraKey}/`)) return false;
            if (extraKey.startsWith(`${rootKey}/`)) {
                return !resolved.some((scanPath) => normalizePathKey(scanPath) === extraKey);
            }
            return true;
        });

    const combined = [...resolved, ...extras];
    const seen = new Set();
    return combined.filter((scanPath) => {
        const key = normalizePathKey(scanPath);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function mergeFictionPatterns(defaults, overrides) {
    if (!overrides || typeof overrides !== 'object') {
        return { ...defaults };
    }
    const merged = { ...defaults, ...overrides };
    for (const key of Object.keys(defaults)) {
        if (Array.isArray(defaults[key]) && Array.isArray(overrides[key])) {
            merged[key] = [...new Set([...defaults[key], ...overrides[key]])];
        }
    }
    return merged;
}

function mergeBaseline(raw, profile = 'standard') {
    const fictionDefaults = profile === 'cascade'
        ? CASCADE_REJECTED_FICTION
        : profile === 'standard'
            ? GENERIC_REJECTED_FICTION
            : {};

    if (!raw || typeof raw !== 'object') {
        return {
            ...DEFAULT_BASELINE,
            rejectedFiction: { ...fictionDefaults }
        };
    }

    return {
        ...DEFAULT_BASELINE,
        ...raw,
        rejectedFiction: raw.rejectedFiction != null
            ? mergeFictionPatterns(fictionDefaults, raw.rejectedFiction)
            : { ...fictionDefaults }
    };
}

function buildInitConfig(baseDir, options = {}) {
    const detected = detectProjectProfile(baseDir);
    const profile = options.profile || detected.profile;
    const rules = JSON.parse(JSON.stringify(PROFILE_RULES[profile] || PROFILE_RULES.standard));

    const config = {
        profile,
        scanPaths: detected.scanPaths,
        productionPaths: detected.productionPaths,
        sampleDir: detected.sampleDir,
        consistencyAnchorSamples: detected.consistencyAnchorSamples,
        ignore: [...IGNORE_DEFAULTS],
        rules,
        gate: { failOn: ['high'], warnOn: ['medium', 'low'] }
    };

    if (profile === 'cascade') {
        config.rules['production-leak'] = { ...PROFILE_RULES.cascade['production-leak'] };
        config.rules['jest-baseline'] = { ...PROFILE_RULES.cascade['jest-baseline'] };
    }

    return { config, detected, profile };
}

function buildInitBaseline(profile = 'standard') {
    const fiction = profile === 'cascade'
        ? CASCADE_REJECTED_FICTION
        : profile === 'standard'
            ? GENERIC_REJECTED_FICTION
            : {};

    return {
        dataSource: 'repository-audit',
        rejectedFiction: fiction,
        syncedAt: null
    };
}

function resolveSimplebeaconDir(root) {
    const primary = path.join(root, '.simplebeacon');
    const legacy = path.join(root, '.samplebeacon');
    if (fs.existsSync(path.join(primary, 'config.json')) || fs.existsSync(primary)) {
        return primary;
    }
    if (fs.existsSync(path.join(legacy, 'config.json')) || fs.existsSync(legacy)) {
        return legacy;
    }
    return primary;
}

function loadSimplebeaconConfig(baseDir, configPath = null) {
    const root = path.resolve(baseDir);
    const simplebeaconDir = resolveSimplebeaconDir(root);
    const explicitConfig = configPath != null && String(configPath).trim() !== '';
    const resolvedConfigPath = explicitConfig
        ? path.resolve(sanitizeFilePath(configPath))
        : path.join(simplebeaconDir, 'config.json');
    const baselinePath = path.join(simplebeaconDir, 'baseline.json');

    if (explicitConfig && !path.isAbsolute(sanitizeFilePath(configPath))) {
        assertPathWithinRoot(resolvedConfigPath, root, { configPath: resolvedConfigPath });
    }

    const configRead = readJsonFile(resolvedConfigPath);
    const baselineRead = readJsonFile(baselinePath);

    const configWarnings = [];
    if (!configRead.ok && !configRead.missing) {
        const message = `Invalid config JSON at ${resolvedConfigPath}: ${configRead.error.message}`;
        if (explicitConfig) {
            throw new ConfigError(message, {
                configPath: resolvedConfigPath,
                originalError: configRead.error.message
            });
        }
        configWarnings.push(message);
    }

    const fileConfig = configRead.ok ? configRead.data : {};
    const profile = fileConfig.profile
        || (isCascadeMonorepo(root) ? 'cascade' : 'standard');
    const profileRules = PROFILE_RULES[profile] || PROFILE_RULES.standard;
    const baseline = mergeBaseline(baselineRead.ok ? baselineRead.data : null, profile);

    const validation = validateConfig(fileConfig);
    configWarnings.push(...validation.errors, ...validation.warnings);

    const config = {
        ...DEFAULT_CONFIG,
        ...fileConfig,
        rules: {
            ...PROFILE_RULES.standard,
            ...profileRules,
            ...(fileConfig.rules || {})
        },
        gate: {
            ...DEFAULT_CONFIG.gate,
            ...(fileConfig.gate || {})
        },
        baseline,
        profile,
        consistencyAnchorSamples: fileConfig.consistencyAnchorSamples
            ?? (profile === 'cascade' ? DEFAULT_CONSISTENCY_ANCHOR_SAMPLES : []),
        configPath: resolvedConfigPath,
        baselinePath,
        simplebeaconDir,
        configWarnings,
        configValid: validation.valid && configRead.ok !== false
    };

    if (!config.ignore) config.ignore = IGNORE_DEFAULTS;
    if (!config.productionPaths) config.productionPaths = DEFAULT_CONFIG.productionPaths;

    return config;
}

function isRuleEnabled(config, ruleName) {
    return config?.rules?.[ruleName]?.enabled !== false;
}

function getRuleOptions(config, ruleName) {
    return config?.rules?.[ruleName] || {};
}

function getInitTemplates(baseDir = process.cwd(), options = {}) {
    const { config, detected, profile } = buildInitConfig(baseDir, options);
    return {
        config,
        baseline: buildInitBaseline(profile),
        detected,
        profile
    };
}

module.exports = {
    CASCADE_REJECTED_FICTION,
    GENERIC_REJECTED_FICTION,
    DEFAULT_MOCK_SCAN_RELATIVE_PATHS,
    DEFAULT_CONSISTENCY_ANCHOR_SAMPLES,
    DEFAULT_BASELINE,
    DEFAULT_CONFIG,
    PROFILE_RULES,
    loadCentralDataConfig,
    loadSimplebeaconConfig,
    loadSamplebeaconConfig: loadSimplebeaconConfig,
    resolveSimplebeaconDir,
    resolveScanPaths,
    resolvePathFromBase,
    normalizeRelativePath,
    isRuleEnabled,
    getRuleOptions,
    getInitTemplates,
    buildInitConfig,
    buildInitBaseline,
    mergeBaseline,
    readJsonFile,
    normalizePathKey
};
