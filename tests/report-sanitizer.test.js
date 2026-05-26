const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const {
    redactSecretsInString,
    sanitizeScanReport,
    sanitizeReportForCloudUpload
} = require('../src/lib/report-sanitizer');
const { purgeExpiredAssessments } = require('../../../server/lib/assessment-retention');

test('redactSecretsInString masks common secret patterns', () => {
    const input = 'found AKIAIOSFODNN7EXAMPLE and sk-abcdefghijklmnopqrstuvwxyz1234567890';
    const out = redactSecretsInString(input);
    assert.ok(!out.includes('AKIAIOSFODNN7EXAMPLE'));
    assert.ok(!out.includes('sk-abcdefghijklmnopqrstuvwxyz1234567890'));
    assert.match(out, /AKIA█+/);
});

test('sanitizeReportForCloudUpload strips rawIssues', () => {
    const report = sanitizeReportForCloudUpload({
        totalFiles: 3,
        rawIssues: [{ type: 'Credential Pattern', description: 'Bearer abcdefghijklmnopqrst' }],
        sampleFiles: ['foo.json']
    });
    assert.equal(report.sanitized, true);
    assert.equal(report.rawIssues, undefined);
    assert.equal(report.sampleFiles, undefined);
    assert.equal(report.totalFiles, 3);
});

test('sanitizeScanReport redacts issue descriptions', () => {
    const report = sanitizeScanReport({
        rawIssues: [{
            description: 'token Bearer abcdefghijklmnopqrstuvwxyz',
            recommendedAction: 'rotate'
        }]
    });
    assert.match(report.rawIssues[0].description, /\[REDACTED\]/);
});

test('purgeExpiredAssessments removes old assessment directories', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'assessment-purge-'));
    const oldDir = path.join(root, 'assessment_1000');
    await fsp.mkdir(oldDir, { recursive: true });
    await fsp.writeFile(path.join(oldDir, 'assessment.json'), `${JSON.stringify({
        metadata: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() }
    })}\n`);

    const result = await purgeExpiredAssessments(root, { maxAgeMs: 24 * 60 * 60 * 1000 });
    assert.deepEqual(result.removed, ['assessment_1000']);
    assert.equal(fs.existsSync(oldDir), false);
    await fsp.rm(root, { recursive: true, force: true });
});
