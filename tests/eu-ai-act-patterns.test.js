const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    scanEuAiActPatterns,
    detectDocumentationArtifacts,
    hasTransparencyDisclosure
} = require('../src/rules/eu-ai-act-patterns');

test('hasTransparencyDisclosure detects Article 50 markers', () => {
    assert.equal(hasTransparencyDisclosure('This content is AI-generated.'), true);
    assert.equal(hasTransparencyDisclosure('You are interacting with an AI assistant.'), true);
    assert.equal(hasTransparencyDisclosure('const x = openai.chat.completions.create();'), false);
});

test('scanEuAiActPatterns detects high-risk employment AI pattern', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-euai-'));
    fs.mkdirSync(path.join(dir, 'server'), { recursive: true });
    fs.writeFileSync(
        path.join(dir, 'server', 'hiring.js'),
        'export const hiringDecisionModel = trainClassifier(data);'
    );

    const result = await scanEuAiActPatterns(dir, { sourcePaths: ['server'] });
    assert.ok(result.summary.highRiskIndicators >= 1);
    assert.ok(result.issues.some((i) => i.metadata?.patternId === 'EUAI-HR-001'));

    fs.rmSync(dir, { recursive: true, force: true });
});

test('scanEuAiActPatterns flags transparency gap in user-facing AI code', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-euai-t50-'));
    fs.mkdirSync(path.join(dir, 'web'), { recursive: true });
    fs.writeFileSync(
        path.join(dir, 'web', 'ChatPage.tsx'),
        'import OpenAI from "openai";\nexport function ChatPage() { return openai.chat.completions.create(); }'
    );

    const result = await scanEuAiActPatterns(dir, { sourcePaths: ['web'] });
    assert.ok(result.summary.transparencyGaps >= 1);
    assert.ok(result.issues.some((i) => i.metadata?.patternId === 'EUAI-T50-001'));

    fs.rmSync(dir, { recursive: true, force: true });
});

test('detectDocumentationArtifacts finds model-card.md', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-euai-doc-'));
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'model-card.md'), '# Model card\n\nPurpose: hiring scorer');

    const artifacts = detectDocumentationArtifacts(dir);
    assert.ok(artifacts.some((a) => a.path.includes('model-card.md')));

    fs.rmSync(dir, { recursive: true, force: true });
});

test('scanEuAiActPatterns passes transparency when disclosure present', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-euai-ok-'));
    fs.mkdirSync(path.join(dir, 'web'), { recursive: true });
    fs.writeFileSync(
        path.join(dir, 'web', 'ChatPage.tsx'),
        'const notice = "You are interacting with an AI assistant.";\nopenai.chat.completions.create();'
    );

    const result = await scanEuAiActPatterns(dir, { sourcePaths: ['web'] });
    assert.equal(result.summary.transparencyGaps, 0);

    fs.rmSync(dir, { recursive: true, force: true });
});
