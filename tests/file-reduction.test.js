const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BuildArtifactScanner } = require('../src/analyzers/file-reduction/build-artifact-scanner');
const { AssetConsolidationScanner } = require('../src/analyzers/file-reduction/asset-consolidation-scanner');
const { UnusedFileDetector } = require('../src/analyzers/file-reduction/unused-file-detector');
const { runFileReductionAnalysis } = require('../src/analyzers/file-reduction');
const { parseJSImports } = require('../src/analyzers/file-reduction/utils/import-parser');
const { generateFileReductionReport } = require('../src/reporters/file-reduction-report');

function makeTempProject(structure) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-reduce-'));
    for (const [relPath, content] of Object.entries(structure)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
    }
    return root;
}

test('BuildArtifactScanner detects node_modules and standalone .map files', async () => {
    const root = makeTempProject({
        'node_modules/pkg/index.js': 'module.exports = {};\n',
        'node_modules/nested/node_modules/pkg/index.js': 'module.exports = {};\n',
        'dist/app.min.js': 'console.log("x");\n',
        'src/app.js.map': '{}',
        'src/index.js': 'console.log("ok");\n'
    });

    const scanner = new BuildArtifactScanner();
    const result = await scanner.scan(root);
    assert.ok(result.findings.some((f) => f.path === 'node_modules'));
    assert.ok(!result.findings.some((f) => f.path === 'node_modules/nested/node_modules'));
    assert.ok(result.findings.some((f) => f.path === 'src/app.js.map'));
    assert.ok(!result.findings.some((f) => f.path === 'dist/app.min.js.map'));
    assert.ok(result.summary.safeToDeleteBytes <= result.summary.reclaimableBytes);
});

test('buildFileReductionPlan groups safe and review categories', async () => {
    const { buildFileReductionPlan } = require('../src/lib/file-reduction-plan');
    const root = makeTempProject({
        'node_modules/pkg/index.js': 'module.exports = {};\n',
        'coverage/lcov.info': 'TN:\n',
        'logs/audit.log': 'entry\n',
        'assets/a.png': 'same',
        'assets/b.png': 'same'
    });
    const report = await runFileReductionAnalysis(root, {
        scanners: {
            'build-artifacts': { enabled: true },
            'asset-consolidation': { enabled: true },
            'unused-files': { enabled: true }
        }
    });
    report.scanProfile = 'file-reduction';
    const plan = buildFileReductionPlan(report);
    assert.ok(plan.safeToDelete.directories >= 1);
    assert.ok(plan.reviewBeforeDelete.logs.length >= 1);
    assert.ok(plan.summaryTable.length >= 3);
});

test('AssetConsolidationScanner groups identical assets', async () => {
    const root = makeTempProject({
        'assets/a.png': 'same-image-bytes',
        'assets/b.png': 'same-image-bytes',
        'assets/c.png': 'different-image'
    });

    const scanner = new AssetConsolidationScanner();
    const result = await scanner.scan(root);
    assert.equal(result.findings.length, 1);
    assert.deepEqual(result.findings[0].duplicates.sort(), ['assets/b.png']);
    assert.equal(result.findings[0].keeper, 'assets/a.png');
});

test('UnusedFileDetector does not treat node_modules index.js as entry points', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({ main: 'index.js' }),
        'index.js': "require('./lib/helper');\n",
        'lib/helper.js': 'module.exports = () => 1;\n',
        'node_modules/dep-a/index.js': "require('./lib/internal');\n",
        'node_modules/dep-a/lib/internal.js': 'module.exports = () => 0;\n',
        'node_modules/dep-b/index.js': 'module.exports = {};\n'
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const entryPoints = result.metadata.entryPoints || [];

    assert.equal(entryPoints.some((p) => p.includes('node_modules')), false);
    assert.ok(entryPoints.includes('index.js'));
    assert.ok(result.summary.entryPoints < 10);
});

test('UnusedFileDetector skips vendor and archive paths', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({ main: 'index.js' }),
        'index.js': "require('./lib/helper');\n",
        'lib/helper.js': 'module.exports = () => 1;\n',
        'node_modules/pkg/index.js': 'module.exports = {};\n',
        'archive/legacy.js': 'module.exports = {};\n',
        'temp/scratch.js': 'module.exports = {};\n'
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const paths = result.findings.map((f) => f.path);
    assert.equal(paths.some((p) => p.includes('node_modules')), false);
    assert.equal(paths.includes('archive/legacy.js'), false);
    assert.equal(paths.includes('temp/scratch.js'), false);
});

test('UnusedFileDetector treats scripts and package bins as entry points', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({ main: 'index.js' }),
        'index.js': "require('./lib/helper');\n",
        'lib/helper.js': 'module.exports = () => 1;\n',
        'lib/orphan.js': 'module.exports = () => 2;\n',
        'scripts/run-task.js': "require('../lib/helper');\n",
        'packages/cli/package.json': JSON.stringify({
            bin: { cli: 'bin/cli.js' }
        }),
        'packages/cli/bin/cli.js': "require('../../lib/helper');\n"
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const paths = result.findings.map((f) => f.path);
    assert.ok(paths.includes('lib/orphan.js'));
    assert.equal(paths.includes('scripts/run-task.js'), false);
    assert.equal(paths.includes('packages/cli/bin/cli.js'), false);
});

test('UnusedFileDetector flags unreferenced modules but keeps entry points', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({ main: 'index.js' }),
        'index.js': "const helper = require('./lib/helper');\nmodule.exports = helper;\n",
        'lib/helper.js': 'module.exports = () => 1;\n',
        'lib/orphan.js': 'module.exports = () => 2;\n'
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    assert.ok(result.findings.some((f) => f.path === 'lib/orphan.js'));
    assert.equal(result.findings.some((f) => f.path === 'lib/helper.js'), false);
});

test('parseJSImports resolves cache-busted relative imports', () => {
    const root = makeTempProject({
        'src/views/Panel.js': 'export const Panel = 1;\n',
        'src/main.js': "import { Panel } from './views/Panel.js?v=123';\n"
    });
    const mainPath = path.join(root, 'src', 'main.js');
    const imports = parseJSImports(
        fs.readFileSync(mainPath, 'utf8'),
        mainPath,
        root
    );
    assert.equal(imports.length, 1);
    assert.ok(imports[0].resolvedPath.endsWith(`${path.sep}src${path.sep}views${path.sep}Panel.js`));
});

test('UnusedFileDetector honors npm script entry points', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({
            main: 'index.js',
            scripts: {
                task: 'node tools/run-task.js',
                helper: 'node --test lib/helper.test.js'
            }
        }),
        'index.js': "require('./lib/core');\n",
        'lib/core.js': 'module.exports = () => 1;\n',
        'lib/orphan.js': 'module.exports = () => 2;\n',
        'tools/run-task.js': "require('../lib/core');\n",
        'lib/helper.test.js': "require('./core');\n"
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const paths = result.findings.map((f) => f.path);
    assert.ok(paths.includes('lib/orphan.js'));
    assert.equal(paths.includes('tools/run-task.js'), false);
});

test('UnusedFileDetector honors python npm script entry points', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({
            main: 'index.js',
            scripts: {
                validate: 'python mock_data_validator.py'
            }
        }),
        'index.js': "require('./lib/core');\n",
        'lib/core.js': 'module.exports = () => 1;\n',
        'mock_data_validator.py': 'print("ok")\n'
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const paths = result.findings.map((f) => f.path);
    assert.equal(paths.includes('mock_data_validator.py'), false);
});

test('UnusedFileDetector skips docs, data samples, and protected runtime files', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({ main: 'index.js' }),
        'index.js': "require('./lib/helper');\n",
        'lib/helper.js': 'module.exports = () => 1;\n',
        'docs/report.json': '{}',
        'web/data/dashboard-home-sample.json': '{}',
        'server/db/demo-users.json': '[]',
        'web/api/mock-backend.js': 'module.exports = {};\n'
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const paths = result.findings.map((f) => f.path);
    assert.equal(paths.includes('docs/report.json'), false);
    assert.equal(paths.includes('web/data/dashboard-home-sample.json'), false);
    assert.equal(paths.includes('server/db/demo-users.json'), false);
    assert.equal(paths.includes('web/api/mock-backend.js'), false);
});

test('UnusedFileDetector skips tests tree at project root', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({ main: 'index.js' }),
        'index.js': "require('./lib/helper');\n",
        'lib/helper.js': 'module.exports = () => 1;\n',
        'tests/unit/foo.test.js': "require('../../lib/helper');\n",
        'tests/api/test_auth_critical.py': 'def test_auth(): pass\n'
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const paths = result.findings.map((f) => f.path);
    assert.equal(paths.some((p) => p.startsWith('tests/')), false);
});

test('UnusedFileDetector skips coverage artifacts', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({ main: 'index.js' }),
        'index.js': "require('./lib/helper');\n",
        'lib/helper.js': 'module.exports = () => 1;\n',
        'coverage/dashboard/coverage-final.json': '{}',
        'coverage/dashboard/lcov-report/index.html': '<html></html>'
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const paths = result.findings.map((f) => f.path);
    assert.equal(paths.some((p) => p.startsWith('coverage/')), false);
});

test('UnusedFileDetector treats jest.critical-path.config.js as entry point', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({
            main: 'index.js',
            scripts: {
                'test:coverage:critical-path': 'jest --config jest.critical-path.config.js --coverage'
            }
        }),
        'index.js': "require('./lib/core');\n",
        'lib/core.js': 'module.exports = () => 1;\n',
        'jest.critical-path.config.js': "module.exports = require('./jest.config');\n",
        'jest.config.js': 'module.exports = {};\n'
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const paths = result.findings.map((f) => f.path);
    assert.equal(paths.includes('jest.critical-path.config.js'), false);
});

test('UnusedFileDetector skips monorepo-prefixed tests tree', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({ name: 'mono' }),
        'ai-platform/package.json': JSON.stringify({ main: 'index.js' }),
        'ai-platform/index.js': "require('./lib/helper');\n",
        'ai-platform/lib/helper.js': 'module.exports = () => 1;\n',
        'ai-platform/tests/unit/foo.test.js': "require('../../lib/helper');\n",
        'ai-platform/tests/api/test_auth_critical.py': 'def test_auth(): pass\n'
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const paths = result.findings.map((f) => f.path);
    assert.equal(paths.some((p) => p.startsWith('ai-platform/tests/')), false);
});

test('UnusedFileDetector skips monorepo-prefixed coverage artifacts', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({ name: 'mono' }),
        'ai-platform/package.json': JSON.stringify({ main: 'index.js' }),
        'ai-platform/index.js': "require('./lib/helper');\n",
        'ai-platform/lib/helper.js': 'module.exports = () => 1;\n',
        'ai-platform/coverage/dashboard/coverage-final.json': '{}',
        'ai-platform/coverage/dashboard/lcov-report/index.html': '<html></html>'
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const paths = result.findings.map((f) => f.path);
    assert.equal(paths.some((p) => p.includes('coverage/')), false);
});

test('UnusedFileDetector treats monorepo-prefixed jest.critical-path.config.js as entry point', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({ name: 'mono' }),
        'ai-platform/package.json': JSON.stringify({
            main: 'index.js',
            scripts: {
                'test:coverage:critical-path': 'jest --config jest.critical-path.config.js --coverage'
            }
        }),
        'ai-platform/index.js': "require('./lib/core');\n",
        'ai-platform/lib/core.js': 'module.exports = () => 1;\n',
        'ai-platform/jest.critical-path.config.js': "module.exports = require('./jest.config');\n",
        'ai-platform/jest.config.js': 'module.exports = {};\n'
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const paths = result.findings.map((f) => f.path);
    assert.equal(paths.includes('ai-platform/jest.critical-path.config.js'), false);
});

test('UnusedFileDetector skips export-system compatibility shim', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({ main: 'index.js' }),
        'index.js': "require('./lib/helper');\n",
        'lib/helper.js': 'module.exports = () => 1;\n',
        'src/web/export-system.js': "script.src = '/scripts/export-system.js';\n",
        'web/scripts/export-system.js': 'window.ExportSystem = {};\n'
    });

    const scanner = new UnusedFileDetector();
    const result = await scanner.scan(root);
    const paths = result.findings.map((f) => f.path);
    assert.equal(paths.includes('src/web/export-system.js'), false);
});

test('parseHtmlReferences resolves web-root absolute asset paths', () => {
    const root = makeTempProject({
        'ai-platform/web/simplebeacon-dashboard/index.html': '<link rel="stylesheet" href="/simplebeacon-dashboard/css/theme.css">',
        'ai-platform/web/simplebeacon-dashboard/css/theme.css': 'body{}'
    });
    const htmlPath = path.join(root, 'ai-platform', 'web', 'simplebeacon-dashboard', 'index.html');
    const { parseHtmlReferences } = require('../src/analyzers/file-reduction/utils/file-reference-tracker');
    const refs = parseHtmlReferences(fs.readFileSync(htmlPath, 'utf8'), htmlPath, root);
    assert.equal(refs.length, 1);
    assert.ok(refs[0].resolvedPath.endsWith(`${path.sep}theme.css`));
});

test('parseJSImports resolves relative require paths', () => {
    const root = path.resolve('/tmp/project');
    const imports = parseJSImports(
        "const x = require('./lib/helper');\nimport y from '../shared/util.js';\n",
        path.join(root, 'src', 'app.js'),
        root
    );
    assert.equal(imports.length, 0);
});

test('runFileReductionAnalysis aggregates scanner summaries', async () => {
    const root = makeTempProject({
        'node_modules/pkg/index.js': 'module.exports = {};\n',
        'assets/a.png': 'dup',
        'assets/b.png': 'dup',
        'package.json': JSON.stringify({ main: 'index.js' }),
        'index.js': "require('./used.js');\n",
        'used.js': 'module.exports = 1;\n',
        'unused.js': 'module.exports = 2;\n'
    });

    const report = await runFileReductionAnalysis(root);
    assert.ok(report.summary.totalFindings > 0);
    assert.ok(report.findings.buildArtifacts.length > 0);
    assert.ok(report.findings.assetConsolidation.length > 0);
    assert.equal(report.dryRun, true);
});

test('runFileReductionAnalysis honors explicit scanner allowlist', async () => {
    const root = makeTempProject({
        'node_modules/pkg/index.js': 'module.exports = {};\n',
        'assets/a.png': 'dup',
        'assets/b.png': 'dup',
        'package.json': JSON.stringify({ main: 'index.js' }),
        'index.js': "require('./used.js');\n",
        'used.js': 'module.exports = 1;\n'
    });

    const report = await runFileReductionAnalysis(root, {
        scanners: {
            'config-management': { enabled: true }
        }
    });

    assert.equal(report.findings.buildArtifacts.length, 0);
    assert.equal(report.findings.assetConsolidation.length, 0);
    assert.equal(report.findings.unusedFiles.length, 0);
    assert.ok(Array.isArray(report.findings.configManagement));
});

test('generateFileReductionReport renders markdown sections', async () => {
    const report = {
        projectRoot: '/tmp/demo',
        generatedAt: '2026-05-25T00:00:00.000Z',
        dryRun: true,
        inventory: { totalFiles: 10, totalDirectories: 2 },
        summary: {
            totalFindings: 2,
            buildArtifactFindings: 1,
            duplicateAssetGroups: 1,
            unusedFileCandidates: 0,
            reclaimableBytes: 100,
            estimatedReductionPct: 20
        },
        findings: {
            buildArtifacts: [{
                path: 'dist',
                reason: 'dist directory',
                fileCount: 3,
                sizeBytes: 100,
                action: 'safe-to-delete'
            }],
            assetConsolidation: [],
            unusedFiles: []
        },
        metadata: { entryPoints: ['index.js'] }
    };

    const markdown = generateFileReductionReport(report);
    assert.match(markdown, /Data Cleanup Report/);
    assert.match(markdown, /Build Artifacts/);
    assert.match(markdown, /dist/);
});
