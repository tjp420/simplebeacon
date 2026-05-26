const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    loadComplianceChecklist,
    evaluateComplianceChecklist
} = require('../src/compliance-checklist');

test('loadComplianceChecklist ignores evaluated output cache without check fields', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-compliance-'));
    const simplebeaconDir = path.join(dir, '.simplebeacon');
    fs.mkdirSync(simplebeaconDir, { recursive: true });
    fs.writeFileSync(path.join(simplebeaconDir, 'compliance-checklist.json'), JSON.stringify({
        evaluatedAt: '2026-05-24T00:00:00.000Z',
        summary: { passed: 7, failed: 1, skipped: 0, total: 8 },
        rules: [
            {
                id: 'GATE-001',
                title: 'Merge gate passes on configured severities',
                status: 'pass',
                evidence: 'cached'
            }
        ]
    }));

    const loaded = loadComplianceChecklist(dir);
    assert.equal(loaded.rules.length, 8);
    assert.equal(loaded.rules[0].check, 'gate-pass');
    assert.equal(loaded.rules[0].status, undefined);

    const evaluated = evaluateComplianceChecklist({
        projectRoot: dir,
        gate: { pass: true },
        credentialFindings: 0,
        credentialScanned: 1,
        productionLeakFindings: 0,
        productionLeakScanned: 1,
        schemaChecked: 1,
        schemaPassed: 1,
        consistencyChecked: 1,
        consistencyScore: 100
    }, { projectRoot: dir });

    assert.notEqual(evaluated.rules[0].evidence, 'Unknown check: undefined');
    assert.equal(evaluated.rules[0].status, 'pass');

    fs.rmSync(dir, { recursive: true, force: true });
});
