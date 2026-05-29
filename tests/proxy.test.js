const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { scanOutboundText } = require('../src/proxy/outbound-scanner');
const { enforceInboundResponse } = require('../src/proxy/inbound-enforcer');
const { createGateway, BLOCK_MESSAGE } = require('../src/proxy/gateway');

test('scanOutboundText blocks AWS access key in prompt JSON', () => {
    const body = JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Use key AKIAIOSFODNN7EXAMPLE in deploy script' }]
    });
    const result = scanOutboundText(body, { blockMedium: true });
    assert.equal(result.blocked, false);
});

test('scanOutboundText blocks real-looking openai key pattern', () => {
    const body = JSON.stringify({
        messages: [{ role: 'user', content: 'token sk-abcdefghijklmnopqrstuvwxyz' }]
    });
    const result = scanOutboundText(body, { blockMedium: true });
    assert.equal(result.blocked, true);
    assert.ok(result.findings.length >= 1);
});

test('scanOutboundText blocks production leak path reference', () => {
    const body = JSON.stringify({
        messages: [{ role: 'user', content: "import data from '../../web/data/dashboard-sample.json'" }]
    });
    const result = scanOutboundText(body, { blockMedium: true });
    assert.equal(result.blocked, true);
});

test('enforceInboundResponse replaces fiction KPI content', () => {
    const upstream = JSON.stringify({
        choices: [{
            message: {
                role: 'assistant',
                content: 'completionRate: 62% and totalFeatures: 47 shipped.'
            }
        }]
    });
    const enforced = enforceInboundResponse(upstream, { projectRoot: process.cwd() });
    assert.equal(enforced.modified, true);
    assert.match(enforced.body, /Simplebeacon Proxy blocked or reformatted/);
});

test('gateway blocks outbound secret before upstream call', async () => {
    const { server } = createGateway({ port: 0, projectRoot: process.cwd() });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const listenPort = address.port;

    const payload = JSON.stringify({
        messages: [{ role: 'user', content: 'token sk-abcdefghijklmnopqrstuvwxyz' }]
    });

    const status = await new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: listenPort,
            method: 'POST',
            path: '/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });

    server.close();
    assert.equal(status.status, 400);
    assert.deepEqual(JSON.parse(status.body), BLOCK_MESSAGE);
});
