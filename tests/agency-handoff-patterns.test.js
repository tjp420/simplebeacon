const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    scanTextPatterns,
    scanHandoffIntegrity,
    scanAgencyHandoffPatterns
} = require('../src/rules/agency-handoff-patterns');

test('scanTextPatterns flags REQUIRE_AUTH=false', () => {
    const content = 'REQUIRE_AUTH=false\n';
    const hits = scanTextPatterns('server/bootstrap.js', content, '.js');
    assert.ok(hits.some((h) => h.pattern === 'SB-DEPLOY-003'));
});

test('scanTextPatterns flags wildcard CORS', () => {
    const content = "app.use(cors({ origin: '*' }));\n";
    const hits = scanTextPatterns('server/index.js', content, '.js');
    assert.ok(hits.some((h) => h.pattern === 'SB-AUTH-001'));
});

test('scanTextPatterns flags merge conflict marker', () => {
    const content = 'const x = 1;\n<<<<<<< HEAD\nconst y = 2;\n';
    const hits = scanTextPatterns('src/app.js', content, '.js');
    assert.ok(hits.some((h) => h.pattern === 'SB-HANDOFF-001'));
});

test('scanHandoffIntegrity flags root .env and missing lockfile', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-handoff-'));
    fs.writeFileSync(path.join(root, '.env'), 'SECRET=1\n');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"demo"}\n');
    const hits = scanHandoffIntegrity(root);
    assert.ok(hits.some((h) => h.pattern === 'SB-ENV-001'));
    assert.ok(hits.some((h) => h.pattern === 'SB-HANDOFF-002'));
});

test('scanHandoffIntegrity skips gitignored root env files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-handoff-gitignore-'));
    fs.writeFileSync(path.join(root, '.gitignore'), '.env\n.env.production\n');
    fs.writeFileSync(path.join(root, '.env'), 'SECRET=1\n');
    fs.writeFileSync(path.join(root, '.env.production'), 'SECRET=2\n');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"demo"}\n');
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
    const hits = scanHandoffIntegrity(root);
    assert.equal(hits.filter((h) => h.pattern === 'SB-ENV-001').length, 0);
});

test('scanTextPatterns skips scanner rule module definitions', () => {
    const rulesPath = path.join(__dirname, '../src/rules/agency-handoff-patterns.js');
    const content = fs.readFileSync(rulesPath, 'utf8');
    const hits = scanTextPatterns(
        'packages/simplebeacon-cli/src/rules/agency-handoff-patterns.js',
        content,
        '.js'
    );
    assert.equal(hits.length, 0);
});

test('scanAgencyHandoffPatterns walks repo', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-handoff-walk-'));
    fs.mkdirSync(path.join(root, 'server'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'server', 'app.js'),
        "console.log('prompt', messages);\n"
    );
    const result = await scanAgencyHandoffPatterns(root, {
        sourcePaths: ['server'],
        productionPaths: ['server/'],
        registryCheck: false
    });
    assert.ok(result.issues.some((i) => i.pattern === 'SB-AI-001'));
});
