/**
 * Detect project layout and suggest simplebeacon configuration.
 */

const fs = require('fs');
const path = require('path');

const SCAN_CANDIDATES = [
    'web/data',
    'data/mock',
    'data-central/ai-tools/mock-data',
    'fixtures',
    '__mocks__',
    'test/fixtures',
    'tests/fixtures',
    'src/mocks',
    'mock',
    'mocks',
    'samples',
    'data/samples',
    'data'
];

const PRODUCTION_CANDIDATES = ['server/', 'src/', 'app/', 'lib/', 'api/', 'services/'];

const IGNORE_DEFAULTS = [
    'node_modules/**',
    'coverage/**',
    'dist/**',
    'build/**',
    '**/*.test.js',
    '**/*.spec.js',
    '**/*.test.ts',
    '**/*.spec.ts',
    'tests/**',
    'test/**',
    'packages/simplebeacon-cli/**'
];

const PLATFORM_DIR_NAMES = ['ai-platform'];

const CASCADE_ANCHORS = [
    'engineering-baseline-sample.json',
    'implementation-plan-sample.json',
    'master-roadmap-sample.json',
    'release-timeline-sample.json',
    'dashboard-home-sample.json',
    'gguf-mock-analysis-sample.json'
];

function pathExists(baseDir, relativePath) {
    const normalized = relativePath.replace(/\/$/, '');
    if (!normalized) return false;
    return fs.existsSync(path.join(baseDir, ...normalized.split('/')));
}

function detectScanPaths(baseDir) {
    const found = SCAN_CANDIDATES.filter((rel) => pathExists(baseDir, rel));
    if (found.length > 0) return found;
    return ['fixtures', '__mocks__', 'data'];
}

function detectProductionPaths(baseDir) {
    const found = PRODUCTION_CANDIDATES.filter((rel) => pathExists(baseDir, rel));
    return found.length > 0 ? found : ['src/', 'lib/'];
}

function detectSampleDir(baseDir, scanPaths) {
    if (scanPaths.includes('web/data')) return 'web/data';
    const withSamples = scanPaths.find((rel) => {
        const abs = path.join(baseDir, ...rel.split('/'));
        if (!fs.existsSync(abs)) return false;
        try {
            return fs.readdirSync(abs).some((name) => name.endsWith('-sample.json'));
        } catch {
            return false;
        }
    });
    return withSamples || scanPaths[0] || 'data';
}

function detectAnchorSamples(baseDir, sampleDir) {
    const abs = path.join(baseDir, ...sampleDir.split('/'));
    if (!fs.existsSync(abs)) return [];
    try {
        return fs.readdirSync(abs)
            .filter((name) => CASCADE_ANCHORS.includes(name))
            .sort();
    } catch {
        return [];
    }
}

function isCascadeMonorepo(baseDir) {
    return pathExists(baseDir, 'web/dashboard-new.html')
        || pathExists(baseDir, 'packages/simplebeacon-cli')
        || pathExists(baseDir, 'server/lib/mock-data-scanner.js');
}

function detectPlatformSignalsAt(baseDir) {
    const root = path.resolve(baseDir);
    return {
        cascadeLayout: isCascadeMonorepo(root),
        pageSampleDir: pathExists(root, 'web/data'),
        stubApi: fs.existsSync(path.join(root, 'src/api/dashboard-stub-api.js')),
        serverEntry: fs.existsSync(path.join(root, 'gguf-dashboard-server.js'))
    };
}

function hasLocalSimplebeaconConfig(baseDir) {
    return fs.existsSync(path.join(baseDir, '.simplebeacon', 'config.json'));
}

function resolvePlatformRoot(projectRoot) {
    const scanRoot = path.resolve(projectRoot);

    // Honey-pot / client repos: own .simplebeacon at scan root must not inherit monorepo parent.
    if (hasLocalSimplebeaconConfig(scanRoot)) {
        return { scanRoot, platformRoot: scanRoot };
    }

    const direct = detectPlatformSignalsAt(scanRoot);
    if (direct.cascadeLayout) {
        return { scanRoot, platformRoot: scanRoot };
    }

    for (const name of PLATFORM_DIR_NAMES) {
        const candidate = path.join(scanRoot, name);
        if (!fs.existsSync(candidate)) continue;
        const signals = detectPlatformSignalsAt(candidate);
        if (signals.cascadeLayout || signals.pageSampleDir || signals.stubApi || signals.serverEntry) {
            return { scanRoot, platformRoot: candidate };
        }
    }

    let current = scanRoot;
    for (let depth = 0; depth < 8; depth += 1) {
        const parent = path.dirname(current);
        if (parent === current) break;
        const signals = detectPlatformSignalsAt(parent);
        if (signals.cascadeLayout) {
            return { scanRoot, platformRoot: parent };
        }
        current = parent;
    }

    if (direct.pageSampleDir || direct.stubApi || direct.serverEntry) {
        return { scanRoot, platformRoot: scanRoot };
    }

    return { scanRoot, platformRoot: scanRoot };
}

function detectPackageManager(baseDir) {
    if (fs.existsSync(path.join(baseDir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(baseDir, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(baseDir, 'package-lock.json'))) return 'npm';
    if (fs.existsSync(path.join(baseDir, 'package.json'))) return 'npm';
    if (fs.existsSync(path.join(baseDir, 'pyproject.toml'))) return 'python';
    if (fs.existsSync(path.join(baseDir, 'requirements.txt'))) return 'python';
    return 'unknown';
}

function detectProjectProfile(baseDir) {
    const root = path.resolve(baseDir);
    const scanPaths = detectScanPaths(root);
    const productionPaths = detectProductionPaths(root);
    const sampleDir = detectSampleDir(root, scanPaths);
    const cascade = isCascadeMonorepo(root);
    const packageManager = detectPackageManager(root);
    const hasSampleJson = detectAnchorSamples(root, sampleDir).length > 0
        || scanPaths.some((rel) => {
            const abs = path.join(root, ...rel.split('/'));
            try {
                return fs.existsSync(abs)
                    && fs.readdirSync(abs).some((n) => n.endsWith('-sample.json'));
            } catch {
                return false;
            }
        });

    let profile = 'standard';
    if (cascade) profile = 'cascade';
    else if (!hasSampleJson) profile = 'minimal';

    return {
        profile,
        scanPaths,
        productionPaths,
        sampleDir,
        consistencyAnchorSamples: cascade || hasSampleJson
            ? detectAnchorSamples(root, sampleDir).length
                ? detectAnchorSamples(root, sampleDir)
                : CASCADE_ANCHORS.filter((name) => fs.existsSync(path.join(root, sampleDir, name)))
            : [],
        packageManager,
        isCascadeMonorepo: cascade,
        hasSampleJson
    };
}

module.exports = {
    SCAN_CANDIDATES,
    PRODUCTION_CANDIDATES,
    IGNORE_DEFAULTS,
    CASCADE_ANCHORS,
    PLATFORM_DIR_NAMES,
    detectProjectProfile,
    detectScanPaths,
    detectProductionPaths,
    detectPlatformSignalsAt,
    resolvePlatformRoot,
    isCascadeMonorepo
};
