#!/usr/bin/env node
/**
 * Simplebeacon Proxy — local HTTP gateway for AI editor traffic.
 * Native Node.js only (http, https, url, stream, fs, path).
 */

const http = require('http');
const https = require('https');
/* URL is a Node.js global (v10+); do not re-import from 'url' (no-redeclare). */
const { scanOutboundText, extractPromptText } = require('./outbound-scanner');
const { enforceInboundResponse } = require('./inbound-enforcer');
const { appendViolationLog } = require('./violation-log');

const DEFAULT_PORT = 3000;
const MAX_BODY_BYTES = Number(process.env.SIMPLEBEACON_PROXY_MAX_BODY || 8 * 1024 * 1024);
const BLOCK_MESSAGE = {
    error: 'Security Block: Sensitive corporate pattern or token leak detected locally.'
};

const UPSTREAM_DEFAULTS = [
    { match: /^\/v1\/messages/i, host: 'api.anthropic.com', protocol: 'https:' },
    { match: /^\/v1\//i, host: 'api.openai.com', protocol: 'https:' }
];

function readRequestBody(req, limit = MAX_BODY_BYTES) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;

        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error(`Request body exceeds ${limit} bytes`));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function readResponseBody(stream, limit = MAX_BODY_BYTES) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;

        stream.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error(`Response body exceeds ${limit} bytes`));
                stream.destroy();
                return;
            }
            chunks.push(chunk);
        });

        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

function resolveUpstream(req) {
    const explicit = process.env.SIMPLEBEACON_PROXY_UPSTREAM;
    if (explicit) {
        const url = new URL(explicit);
        return {
            protocol: url.protocol,
            host: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            pathPrefix: url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
        };
    }

    const headerHost = req.headers['x-simplebeacon-upstream']
        || req.headers['x-target-host']
        || req.headers['x-forwarded-host'];

    if (headerHost) {
        const hostOnly = String(headerHost).split(':')[0];
        return {
            protocol: 'https:',
            host: hostOnly,
            port: 443,
            pathPrefix: ''
        };
    }

    const pathname = req.url.split('?')[0] || '/';
    for (const rule of UPSTREAM_DEFAULTS) {
        if (rule.match.test(pathname)) {
            return {
                protocol: rule.protocol,
                host: rule.host,
                port: 443,
                pathPrefix: ''
            };
        }
    }

    return null;
}

function buildForwardHeaders(req, upstreamHost) {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers['content-length'];
    delete headers['transfer-encoding'];
    delete headers['x-simplebeacon-upstream'];
    delete headers['x-target-host'];
    headers.host = upstreamHost;
    return headers;
}

function sendJson(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'X-Simplebeacon-Proxy': 'block'
    });
    res.end(body);
}

function logFindings(projectRoot, direction, findings, extra = {}) {
    for (const finding of findings) {
        appendViolationLog(projectRoot, {
            direction,
            kind: finding.type || finding.kind || 'scan',
            pattern: finding.pattern || finding.metadata?.patternId || null,
            description: finding.description || null,
            blocked: Boolean(extra.blocked),
            ...extra
        });
    }
}

function forwardRequest(req, res, upstream, bodyBuffer, projectRoot) {
    const requestUrl = new URL(req.url, `${upstream.protocol}//${upstream.host}`);
    const targetPath = `${upstream.pathPrefix || ''}${requestUrl.pathname}${requestUrl.search}`;
    const transport = upstream.protocol === 'https:' ? https : http;

    const options = {
        protocol: upstream.protocol,
        hostname: upstream.host,
        port: upstream.port,
        method: req.method,
        path: targetPath,
        headers: {
            ...buildForwardHeaders(req, upstream.host),
            'Content-Length': bodyBuffer.length
        }
    };

    const proxyReq = transport.request(options, (proxyRes) => {
        const contentType = String(proxyRes.headers['content-type'] || '');
        const isEventStream = contentType.includes('text/event-stream');

        if (isEventStream) {
            res.writeHead(proxyRes.statusCode || 200, {
                ...proxyRes.headers,
                'X-Simplebeacon-Proxy': 'stream-pass-through'
            });
            proxyRes.pipe(res);
            return;
        }

        readResponseBody(proxyRes)
            .then((responseBuffer) => {
                let outboundBody = responseBuffer;
                let modified = false;

                if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300 && responseBuffer.length) {
                    const text = responseBuffer.toString('utf8');
                    const enforced = enforceInboundResponse(text, { projectRoot });
                    if (enforced.modified) {
                        modified = true;
                        outboundBody = Buffer.from(enforced.body, 'utf8');
                        logFindings(projectRoot, 'inbound', enforced.violations, { blocked: false, replaced: true });
                    }
                }

                const responseHeaders = { ...proxyRes.headers };
                delete responseHeaders['content-length'];
                delete responseHeaders['transfer-encoding'];
                responseHeaders['content-length'] = String(outboundBody.length);
                responseHeaders['X-Simplebeacon-Proxy'] = modified ? 'inbound-replaced' : 'pass';

                res.writeHead(proxyRes.statusCode || 502, responseHeaders);
                res.end(outboundBody);
            })
            .catch((error) => {
                sendJson(res, 502, { error: `Simplebeacon Proxy upstream read failed: ${error.message}` });
            });
    });

    proxyReq.on('error', (error) => {
        sendJson(res, 502, { error: `Simplebeacon Proxy upstream error: ${error.message}` });
    });

    proxyReq.write(bodyBuffer);
    proxyReq.end();
}

async function handleRequest(req, res, options = {}) {
    const projectRoot = options.projectRoot || process.cwd();

    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
        sendJson(res, 200, {
            service: 'simplebeacon-proxy',
            status: 'ok',
            port: options.port || DEFAULT_PORT
        });
        return;
    }

    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
    }

    let bodyBuffer;
    try {
        bodyBuffer = await readRequestBody(req);
    } catch (error) {
        sendJson(res, 413, { error: error.message });
        return;
    }

    const bodyString = bodyBuffer.toString('utf8');
    const promptText = extractPromptText(bodyString);
    const scanTarget = `${promptText}\n${bodyString}`;
    const outbound = scanOutboundText(scanTarget, { blockMedium: true });

    if (outbound.blocked) {
        logFindings(projectRoot, 'outbound', outbound.findings, { blocked: true });
        sendJson(res, 400, BLOCK_MESSAGE);
        return;
    }

    if (outbound.findings.length) {
        logFindings(projectRoot, 'outbound', outbound.findings, { blocked: false });
    }

    const upstream = resolveUpstream(req);
    if (!upstream) {
        sendJson(res, 502, {
            error: 'No upstream configured. Set SIMPLEBEACON_PROXY_UPSTREAM or send x-simplebeacon-upstream header.'
        });
        return;
    }

    forwardRequest(req, res, upstream, bodyBuffer, projectRoot);
}

function createGateway(options = {}) {
    const port = Number(options.port || process.env.SIMPLEBEACON_PROXY_PORT || DEFAULT_PORT);
    const projectRoot = options.projectRoot || process.cwd();

    const server = http.createServer((req, res) => {
        handleRequest(req, res, { port, projectRoot }).catch((error) => {
            sendJson(res, 500, { error: `Simplebeacon Proxy error: ${error.message}` });
        });
    });

    return { server, port, projectRoot };
}

function startGateway(options = {}) {
    const { server, port, projectRoot } = createGateway(options);

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, options.host || '127.0.0.1', () => {
            resolve({
                server,
                port,
                projectRoot,
                url: `http://${options.host || '127.0.0.1'}:${port}`
            });
        });
    });
}

if (require.main === module) {
    startGateway()
        .then(({ url, projectRoot }) => {
            process.stdout.write(`Simplebeacon Proxy listening on ${url}\n`);
            process.stdout.write(`Project root: ${projectRoot}\n`);
            process.stdout.write(`Violations log: ${require('./violation-log').resolveLogPath(projectRoot)}\n`);
        })
        .catch((error) => {
            process.stderr.write(`${error.message}\n`);
            process.exit(1);
        });
}

module.exports = {
    createGateway,
    startGateway,
    handleRequest,
    readRequestBody,
    BLOCK_MESSAGE
};
