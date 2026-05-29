const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runFixDryRun, formatFixDryRunText } = require('../src/fix-dry-run');

test('runFixDryRun builds structured plan from inline scan payload', () => {
    const plan = runFixDryRun({
        path: path.join(__dirname, '../../..'),
        scanPayload: {
            projectRoot: path.join(__dirname, '../../..'),
            issues: [{
                severity: 'high',
                filePath: 'server/config.js',
                line: 8,
                type: 'CREDENTIALS',
                snippet: 'const stripe = "sk_test_example"'
            }]
        }
    });

    assert.equal(plan.fixCount, 1);
    assert.equal(plan.fixes[0].fixSpec.kind, 'credentials');
    assert.match(plan.verify, /simplebeacon scan/);
});

test('formatFixDryRunText summarizes fixes for terminal output', () => {
    const text = formatFixDryRunText({
        reportSource: '.simplebeacon/report.json',
        gatePass: false,
        fixCount: 1,
        verify: 'npx simplebeacon scan --gate',
        fixes: [{
            severity: 'high',
            location: 'server/config.js:8',
            kind: 'credentials',
            blocksGate: true,
            estimatedMinutes: 15,
            businessImpact: 'Immediate credential exposure',
            recipe: 'Replace with process.env.STRIPE_SECRET_KEY'
        }]
    });

    assert.match(text, /Fix dry-run/i);
    assert.match(text, /server\/config\.js:8/);
    assert.match(text, /Blocks gate/i);
});
