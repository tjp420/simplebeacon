const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    scanTextPatterns,
    scanSuspiciousDependencies,
    scanLlmSlopPatterns
} = require('../src/rules/llm-slop-patterns');

test('scanTextPatterns flags YOUR_API_KEY_HERE placeholder', () => {
    const content = 'const key = "YOUR_API_KEY_HERE";\n';
    const hits = scanTextPatterns('src/config.js', content, '.js');
    assert.ok(hits.some((h) => h.pattern === 'SB-FICTION-001'));
});

test('scanTextPatterns flags markdown fence in source file', () => {
    const content = 'const x = `\n```javascript\nconsole.log(1)\n`;\n';
    const hits = scanTextPatterns('src/broken.js', content, '.js');
    assert.ok(hits.some((h) => h.pattern === 'SB-FICTION-002'));
});

test('scanTextPatterns ignores fence-detector regex definitions', () => {
    const ruleLine = "        regex: /(```javascript|```typescript|```python|```json|```\\s?$)/gm,\n";
    const parserLine = "    const fenced = text.match(/```json\\s*([\\s\\S]*?)```/gi) || [];\n";
    assert.equal(
        scanTextPatterns('packages/simplebeacon-cli/src/rules/llm-slop-patterns.js', ruleLine, '.js').length,
        0
    );
    assert.equal(
        scanTextPatterns('packages/simplebeacon-cli/src/proxy/inbound-enforcer.js', parserLine, '.js').length,
        0
    );
});

test('scanTextPatterns flags lorem ipsum UI copy', () => {
    const content = '<p>Lorem Ipsum Dolor sit amet</p>\n';
    const hits = scanTextPatterns('web/index.html', content, '.html');
    assert.ok(hits.some((h) => h.pattern === 'SB-FICTION-004'));
});

test('scanSuspiciousDependencies flags fake-* package names', () => {
    const content = JSON.stringify({
        dependencies: {
            'fake-auth-lib': '1.0.0',
            express: '4.18.0'
        }
    }, null, 2);
    const hits = scanSuspiciousDependencies('package.json', content);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].pattern, 'SB-FICTION-003');
});

test('scanLlmSlopPatterns walks repo and finds placeholder in source', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-slop-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'src', 'app.js'),
        'export const token = "INSERT_SECRET_HERE";\n'
    );
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'demo', dependencies: { 'mock-api-client': '0.0.1' } }, null, 2)
    );

    const result = await scanLlmSlopPatterns(root, {
        sourcePaths: ['src'],
        productionPaths: ['src'],
        registryCheck: false
    });

    assert.ok(result.findings >= 2);
    assert.ok(result.issues.some((i) => i.pattern === 'SB-FICTION-001'));
    assert.ok(result.issues.some((i) => i.pattern === 'SB-FICTION-003'));
});
