const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ConfigManagementAnalyzer } = require('../src/analyzers/data-cleanup/config-management-analyzer');
const { DependencyHealthAnalyzer } = require('../src/analyzers/data-cleanup/dependency-health-analyzer');
const { EnvironmentVariableAnalyzer } = require('../src/analyzers/data-cleanup/environment-variable-analyzer');
const { aggregateCleanupFindings } = require('../src/lib/result-aggregator');
const { walkProjectFiles } = require('../src/analyzers/file-reduction/utils/project-walker');

function makeTempProject(structure) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-cleanup-'));
    for (const [relPath, content] of Object.entries(structure)) {
        const fullPath = path.join(root, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
    }
    return root;
}

test('ConfigManagementAnalyzer flags env sprawl and profile-local inconsistencies', async () => {
    const root = makeTempProject({
        '.env': 'PORT=3000\nAPI_URL=http://localhost\n',
        '.env.example': 'PORT=4000\nAPI_URL=http://localhost\n',
        '.env.production': 'PORT=8080\nAPI_URL=https://prod.example\n',
        '.env.development': 'PORT=3000\n',
        '.env.local': 'PORT=3001\n',
        'webpack.config.js': 'module.exports = {};\n',
        'vite.config.js': 'export default {};\n'
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new ConfigManagementAnalyzer();
    const result = await scanner.scan(root, { inventory });
    assert.ok(result.findings.some((f) => f.type === 'config-sprawl'));
    assert.ok(result.findings.some((f) => f.type === 'env-inconsistency' && f.metadata.key === 'PORT'));
    assert.ok(!result.findings.some((f) =>
        f.type === 'env-inconsistency'
        && f.metadata.key === 'API_URL'
        && f.metadata.values.some((entry) => entry.file === '.env.production')
        && f.metadata.values.some((entry) => entry.file === '.env')
    ));
    assert.ok(result.findings.some((f) => f.type === 'duplicate-config-type'));
});

test('DependencyHealthAnalyzer detects duplicate sections and version drift', async () => {
    const root = makeTempProject({
        'apps/a/package.json': JSON.stringify({
            dependencies: { lodash: '^4.17.0', express: '^4.18.0' },
            devDependencies: { express: '^4.19.0' }
        }),
        'apps/a/index.js': "const express = require('express');\n",
        'apps/b/package.json': JSON.stringify({
            dependencies: { lodash: '^4.18.0' }
        }),
        'apps/b/index.js': "const _ = require('lodash');\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new DependencyHealthAnalyzer();
    const result = await scanner.scan(root, { inventory });
    assert.ok(result.findings.some((f) => f.type === 'duplicate-dependency' && f.metadata.dependency === 'express'));
    assert.ok(result.findings.some((f) => f.type === 'version-drift' && f.metadata.dependency === 'lodash'));
});

test('EnvironmentVariableAnalyzer detects missing and unused env keys', async () => {
    const root = makeTempProject({
        '.env': 'PORT=3000\nLEGACY_FLAG=1\n',
        'server.js': "const port = process.env.PORT;\nconst api = process.env.API_BASE;\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new EnvironmentVariableAnalyzer();
    const result = await scanner.scan(root, { inventory });
    assert.ok(result.findings.some((f) => f.type === 'missing-env-key' && f.metadata.key === 'API_BASE'));
    assert.ok(result.findings.some((f) => f.type === 'unused-env-key' && f.metadata.key === 'LEGACY_FLAG'));
});

test('EnvironmentVariableAnalyzer treats OS-injected env keys as runtime-provided', async () => {
    const root = makeTempProject({
        'tools/restore.js': "const home = process.env.USERPROFILE || process.env.HOME;\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new EnvironmentVariableAnalyzer();
    const result = await scanner.scan(root, { inventory });
    assert.ok(!result.findings.some((f) => f.type === 'missing-env-key' && f.metadata.key === 'USERPROFILE'));
});

test('EnvironmentVariableAnalyzer skips phase-2 SSO example keys', async () => {
    const root = makeTempProject({
        '.env.example.phase2-sso': 'SAML_ENABLED=false\nLDAP_URL=ldap://test\n',
        '.env.example': 'PORT=3000\n',
        'server.js': "const port = process.env.PORT;\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new EnvironmentVariableAnalyzer();
    const result = await scanner.scan(root, { inventory });
    assert.ok(!result.findings.some((f) => f.type === 'unused-env-key' && f.metadata.key === 'SAML_ENABLED'));
    assert.ok(!result.findings.some((f) => f.type === 'unused-env-key' && f.metadata.key === 'LDAP_URL'));
});

test('EnvironmentVariableAnalyzer skips optional store keys with code defaults', async () => {
    const root = makeTempProject({
        '.env': 'PORT=3000\n',
        'server/lib/sales-commission-store.js': "const p = process.env.SIMPLEBEACON_SALES_COMMISSIONS_STORE || '.simplebeacon/sales-commissions.json';\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new EnvironmentVariableAnalyzer();
    const result = await scanner.scan(root, { inventory });
    assert.ok(!result.findings.some((f) =>
        f.type === 'missing-env-key' && f.metadata.key === 'SIMPLEBEACON_SALES_COMMISSIONS_STORE'
    ));
});

test('ConfigManagementAnalyzer ignores example-vs-production feature flag drift', async () => {
    const root = makeTempProject({
        '.env.production': 'SIMPLEBEACON_MONETIZATION_ENABLED=true\n',
        '.env.production.example': 'SIMPLEBEACON_MONETIZATION_ENABLED=false\n'
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new ConfigManagementAnalyzer();
    const result = await scanner.scan(root, { inventory });
    assert.ok(!result.findings.some((f) =>
        f.type === 'env-inconsistency' && f.metadata.key === 'SIMPLEBEACON_MONETIZATION_ENABLED'
    ));
});

test('EnvironmentVariableAnalyzer detects get() and resolveCredential env references', async () => {
    const root = makeTempProject({
        '.env': 'STRIPE_PUBLISHABLE_KEY=pk_test_x\n',
        'server/config.js': "function get(k){return process.env[k]} const pk = get('STRIPE_PUBLISHABLE_KEY');\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new EnvironmentVariableAnalyzer();
    const result = await scanner.scan(root, { inventory });
    assert.ok(!result.findings.some((f) => f.type === 'unused-env-key' && f.metadata.key === 'STRIPE_PUBLISHABLE_KEY'));
});

test('DependencyHealthAnalyzer detects tools/ requires before file cap', async () => {
    const root = makeTempProject({
        'package.json': JSON.stringify({
            dependencies: { archiver: '^6.0.1', express: '^4.18.0' }
        }),
        'index.js': "const express = require('express');\n",
        'tools/bundle.js': "const archiver = require('archiver');\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new DependencyHealthAnalyzer();
    const result = await scanner.scan(root, { inventory });
    assert.ok(!result.findings.some((f) => f.type === 'unused-dependency' && f.metadata.dependency === 'archiver'));
});

test('DependencyHealthAnalyzer ignores node_modules package manifests', async () => {
    const root = makeTempProject({
        'apps/a/package.json': JSON.stringify({
            dependencies: { express: '^4.18.0' }
        }),
        'apps/a/index.js': "const express = require('express');\n",
        'node_modules/lodash/package.json': JSON.stringify({
            dependencies: { 'unused-dep': '^1.0.0' }
        }),
        'node_modules/lodash/index.js': "module.exports = {};\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new DependencyHealthAnalyzer();
    const result = await scanner.scan(root, { inventory });
    assert.equal(result.summary.packageJsonFiles, 1);
    assert.ok(!result.findings.some((f) => String(f.path).includes('node_modules')));
});

test('ConfigManagementAnalyzer ignores node_modules config files', async () => {
    const root = makeTempProject({
        '.env': 'PORT=3000\n',
        'tsconfig.json': '{}\n',
        'node_modules/foo/tsconfig.json': '{}\n',
        'node_modules/foo/package.json': '{}\n'
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new ConfigManagementAnalyzer();
    const result = await scanner.scan(root, { inventory });
    assert.equal(result.summary.packageJsonFiles, 0);
    assert.ok(result.summary.configFiles <= 2);
});

test('buildExecutiveSummary categorizes credential findings', () => {
    const { buildExecutiveSummary } = require('../src/lib/executive-summary');
    const report = {
        generatedAt: new Date().toISOString(),
        scanProfile: 'data-quality',
        scanners: {
            'data-privacy': { credentialHits: 2, piiHits: 3 },
            'dependency-health': { packageJsonFiles: 12, unusedDependencies: 4, versionDrift: 2 },
            'config-management': { envFiles: 5, inconsistentEnvKeys: 3 },
            'environment-variables': { missingKeys: 2, unusedKeys: 10 },
            'data-consistency': { shapeDriftGroups: 1 },
            'data-access-patterns': { patternFindings: 5 },
            'data-lineage': { orphanedDataFiles: 8 }
        },
        findings: {
            dataPrivacy: [
                {
                    path: 'tests/fixtures/simplebeacon-toxic-fixtures/src/server/auth-mock.js',
                    reason: 'Credential pattern (aws-access-key) in data file',
                    metadata: { line: 2, patternId: 'aws-access-key' }
                },
                {
                    path: 'docs/reports/MOCK_DATA_PREVENTION_GUIDELINES.md',
                    reason: 'Possible realistic email in data file',
                    metadata: { line: 10, patternId: 'realistic-email' }
                }
            ]
        },
        summary: { reclaimableBytes: 0 }
    };
    const summary = buildExecutiveSummary(report);
    assert.equal(summary.security.credentials.length, 1);
    assert.equal(summary.security.credentialsNeedingReview, 0);
    assert.equal(summary.security.piiNeedingReview, 0);
    assert.ok(summary.notes.some((note) => note.includes('test fixtures') || note.includes('mock/sample')));
});

test('buildScannerStatistics exposes workspace-scoped scanner counts', () => {
    const { buildScannerStatistics } = require('../src/lib/scanner-statistics');
    const report = {
        projectRoot: '/tmp/project',
        durationMs: 1000,
        inventory: { totalFiles: 100, totalDirectories: 10 },
        scanners: {
            'config-management': {
                configFiles: 5,
                envFiles: 2,
                packageJsonFiles: 2,
                sprawlFindings: 1,
                inconsistentEnvKeys: 3
            },
            'dependency-health': {
                packageJsonFiles: 2,
                uniqueDependencies: 10,
                unusedDependencies: 1,
                duplicateDependencies: 0,
                versionDrift: 0
            }
        },
        findings: {
            configManagement: [
                { type: 'config-sprawl' },
                { type: 'env-inconsistency' },
                { type: 'env-inconsistency' },
                { type: 'env-inconsistency' }
            ],
            dependencyHealth: [{ type: 'unused-dependency' }]
        }
    };
    const stats = buildScannerStatistics(report);
    assert.equal(stats.scanners['config-management'].stats.packageJsonFiles, 2);
    assert.equal(stats.scanners['dependency-health'].stats.unusedDependencies, 1);
    assert.equal(stats.findingsBreakdown.configManagement.envInconsistencies, 3);
});

test('enrichCleanupReport preserves dependency-health stats when findings are clean', () => {
    const { enrichCleanupReport } = require('../src/lib/enrich-cleanup-report');
    const enriched = enrichCleanupReport({
        projectRoot: '/tmp/project',
        durationMs: 500,
        inventory: { totalFiles: 100, totalDirectories: 10 },
        scanners: {
            'dependency-health': {
                packageJsonFiles: 2,
                uniqueDependencies: 24,
                unusedDependencies: 0,
                duplicateDependencies: 0,
                versionDrift: 0
            },
            'config-management': {
                configFiles: 5,
                envFiles: 2,
                packageJsonFiles: 2
            }
        },
        findings: {
            configManagement: [],
            dependencyHealth: [],
            environmentVariables: []
        },
        summary: { totalFindings: 0 }
    }, { profile: 'data-quality' });

    assert.equal(enriched.scanners['dependency-health'].packageJsonFiles, 2);
    assert.equal(enriched.scanners['dependency-health'].uniqueDependencies, 24);
    assert.equal(enriched.executiveSummary.workspace.packageJsonFiles, 2);
});

test('triagePrivacyFindings groups PII by category', () => {
    const { triagePrivacyFindings } = require('../src/lib/privacy-triage');
    const triaged = triagePrivacyFindings([
        { path: 'docs/reports/MOCK_DATA_GUIDE.md', reason: 'Possible realistic email in data file', metadata: { line: 1 } },
        { path: 'web/data/users-sample.json', reason: 'Possible realistic email in data file', metadata: { line: 2 } },
        { path: 'src/server/users.js', reason: 'Possible realistic email in data file', metadata: { line: 3 } }
    ]);
    assert.equal(triaged.byCategory.documentation, 1);
    assert.equal(triaged.byCategory['mock-sample-data'], 1);
    assert.equal(triaged.piiNeedingReview, 1);
});

test('aggregateCleanupFindings dedupes and sorts by severity', () => {
    const aggregated = aggregateCleanupFindings([
        { type: 'env-secret', path: '.env', reason: 'a', severity: 'high' },
        { type: 'env-secret', path: '.env', reason: 'a', severity: 'high' },
        { type: 'unused-env-key', path: '.env', reason: 'b', severity: 'low' }
    ]);
    assert.equal(aggregated.findings.length, 2);
    assert.equal(aggregated.findings[0].severity, 'high');
});

test('DataFreshnessAnalyzer flags old mock data files', async () => {
    const root = makeTempProject({
        'web/data/users-sample.json': '{"users":[]}\n'
    });
    const filePath = path.join(root, 'web/data/users-sample.json');
    const oldDate = new Date(Date.now() - (200 * 24 * 60 * 60 * 1000));
    fs.utimesSync(filePath, oldDate, oldDate);

    const inventory = await walkProjectFiles(root);
    const scanner = new (require('../src/analyzers/data-cleanup/data-freshness-analyzer').DataFreshnessAnalyzer)({ staleDays: 90 });
    const result = await scanner.scan(root, { inventory });
    assert.ok(result.findings.some((f) => f.type === 'stale-data'));
});

test('DataAccessPatternAnalyzer flags sync reads in route handlers', async () => {
    const root = makeTempProject({
        'server/routes/data.js': "router.get('/x', (req,res)=>{ const x = JSON.parse(fs.readFileSync('data.json')); res.json(x); });\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new (require('../src/analyzers/data-cleanup/data-access-pattern-analyzer').DataAccessPatternAnalyzer)();
    const result = await scanner.scan(root, { inventory });
    assert.ok(result.findings.some((f) => f.type === 'data-access-pattern'));
});

test('DataPrivacyAnalyzer flags PII in mock data', async () => {
    const root = makeTempProject({
        'web/data/users-sample.json': '{"email":"john.doe@company.com"}\n'
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new (require('../src/analyzers/data-cleanup/data-privacy-analyzer').DataPrivacyAnalyzer)({ useCache: false });
    const result = await scanner.scan(root, { inventory, useCache: false });
    assert.ok(result.findings.some((f) => f.type === 'data-privacy'));
    const hit = result.findings.find((f) => f.metadata?.patternId === 'realistic-email');
    assert.ok(hit.metadata.confidenceScore >= 0.3);
});

test('scanPiiContent skips comment and documentation example contexts', () => {
    const { scanPiiContent } = require('../src/analyzers/data-cleanup/data-privacy-analyzer');
    const docFindings = scanPiiContent('docs/MOCK_DATA_GUIDE.md', [
        '// contact admin@example.com for help',
        'See admin@company.com in production only'
    ].join('\n'));
    assert.equal(docFindings.length, 0);

    const codeFindings = scanPiiContent('server/config.js', [
        "const owner = 'ops@company.com';"
    ].join('\n'));
    assert.ok(codeFindings.some((f) => f.metadata.patternId === 'realistic-email'));
});

test('DataLineageAnalyzer detects runtime fetch references to data files', async () => {
    const root = makeTempProject({
        'web/data/users.json': '{"users":[]}\n',
        'server/routes/users.js': "fetch('web/data/users.json').then(r => r.json());\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new (require('../src/analyzers/data-cleanup/data-lineage-analyzer').DataLineageAnalyzer)();
    const result = await scanner.scan(root, { inventory });
    assert.equal(result.findings.length, 0);
    assert.ok(result.metadata.lineage.some((entry) =>
        entry.path.includes('web/data/users.json') && entry.consumerCount >= 1
    ));
});

test('crossReferenceScannerResults boosts PII severity for orphaned data files', () => {
    const { crossReferenceScannerResults } = require('../src/lib/cross-analyzer-intelligence');
    const results = crossReferenceScannerResults({
        'data-privacy': {
            findings: [{
                type: 'data-privacy',
                path: 'reports/orphan-mock.json',
                severity: 'medium',
                metadata: { patternId: 'realistic-email', line: 1 }
            }]
        },
        'data-lineage': {
            findings: [{
                type: 'orphaned-data',
                path: 'reports/orphan-mock.json',
                metadata: { consumerCount: 0 }
            }]
        }
    });
    const boosted = results['data-privacy'].findings[0];
    assert.equal(boosted.severity, 'high');
    assert.equal(boosted.metadata.crossAnalyzerBoost, 'orphaned-data-with-pii');
});

test('ConfigManagementAnalyzer flags unreferenced non-root configs', async () => {
    const root = makeTempProject({
        'tools/vite.config.js': 'export default {};\n',
        'server/index.js': "console.log('no vite refs');\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new ConfigManagementAnalyzer();
    const result = await scanner.scan(root, { inventory });
    assert.ok(result.findings.some((f) => f.type === 'unused-config' && f.path.includes('tools/vite.config.js')));
});

test('DataLineageAnalyzer marks unreferenced mock json as orphaned', async () => {
    const root = makeTempProject({
        'reports/orphan-mock.json': '{"ok":true}\n',
        'server/index.js': "console.log('no data refs');\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new (require('../src/analyzers/data-cleanup/data-lineage-analyzer').DataLineageAnalyzer)();
    const result = await scanner.scan(root, { inventory });
    assert.ok(result.findings.some((f) => f.path.includes('orphan-mock.json')));
});

test('DataLineageAnalyzer skips allowlisted runtime sample paths', async () => {
    const root = makeTempProject({
        'web/data/dashboard-home-sample.json': '{"ok":true}\n',
        'data/mock/report.json': '{"ok":true}\n',
        'server/index.js': "console.log('no static refs');\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new (require('../src/analyzers/data-cleanup/data-lineage-analyzer').DataLineageAnalyzer)();
    const result = await scanner.scan(root, { inventory });
    assert.equal(result.findings.length, 0);
    assert.equal(result.summary.orphanedDataFiles, 0);
});

test('DataLineageAnalyzer skips nested tests/fixtures paths (monorepo layout)', async () => {
    const root = makeTempProject({
        'ai-platform/tests/fixtures/core/core-flow.json': '{"ok":true}\n',
        'server/index.js': "console.log('no static refs');\n"
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new (require('../src/analyzers/data-cleanup/data-lineage-analyzer').DataLineageAnalyzer)();
    const result = await scanner.scan(root, { inventory });
    assert.equal(result.findings.length, 0);
    assert.equal(result.summary.orphanedDataFiles, 0);
});

test('DataConsistencyAnalyzer ignores intentional mock sample shape differences', async () => {
    const root = makeTempProject({
        'web/data/a-sample.json': '{"type":"a","items":[]}\n',
        'web/data/b-sample.json': '{"type":"b","rows":[]}\n'
    });
    const inventory = await walkProjectFiles(root);
    const scanner = new (require('../src/analyzers/data-cleanup/data-consistency-analyzer').DataConsistencyAnalyzer)();
    const result = await scanner.scan(root, { inventory });
    assert.ok(!result.findings.some((f) => f.type === 'data-shape-drift'));
});
