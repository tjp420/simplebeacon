/**
 * Trust signals for local scans: network isolation monitoring and read-only guarantees.
 */

const http = require('http');
const https = require('https');

function describeRequestTarget(args) {
    const first = args[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
        if (first.href) return first.href;
        const host = first.hostname || first.host || 'unknown';
        const protocol = first.protocol || 'http:';
        return `${protocol}//${host}`;
    }
    return 'unknown';
}

function createNetworkGuard(options = {}) {
    const offline = options.offline === true;
    const events = [];
    const originals = {
        httpRequest: http.request,
        httpsRequest: https.request,
        fetch: typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null
    };

    function record(kind, target) {
        const entry = { kind, target, at: new Date().toISOString() };
        events.push(entry);
        if (offline) {
            throw new Error(`Offline mode blocked ${kind} to ${target}`);
        }
    }

    http.request = function patchedHttpRequest(...args) {
        record('http.request', describeRequestTarget(args));
        return originals.httpRequest.apply(this, args);
    };
    https.request = function patchedHttpsRequest(...args) {
        record('https.request', describeRequestTarget(args));
        return originals.httpsRequest.apply(this, args);
    };
    if (originals.fetch) {
        globalThis.fetch = async function patchedFetch(input, init) {
            const target = typeof input === 'string' ? input : input?.url || 'fetch:unknown';
            record('fetch', target);
            return originals.fetch(input, init);
        };
    }

    return {
        offline,
        get events() {
            return events.slice();
        },
        assertOfflineClean() {
            if (offline && events.length > 0) {
                const sample = events[0];
                throw new Error(`Offline mode detected network activity (${sample.kind} → ${sample.target})`);
            }
        },
        dispose() {
            http.request = originals.httpRequest;
            https.request = originals.httpsRequest;
            if (originals.fetch) {
                globalThis.fetch = originals.fetch;
            }
        }
    };
}

function snapshotFileState(filePath) {
    const stat = require('fs').statSync(filePath);
    return {
        content: require('fs').readFileSync(filePath, 'utf8'),
        size: stat.size,
        mtimeMs: stat.mtimeMs
    };
}

function assertFileUnchanged(filePath, before) {
    const after = snapshotFileState(filePath);
    if (after.content !== before.content) {
        throw new Error(`File content changed during scan: ${filePath}`);
    }
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
        throw new Error(`File metadata changed during scan: ${filePath}`);
    }
}

function printTrustBanner(options = {}, paint = (text) => text) {
    if (options.quiet) return;
    const lines = [
        `${paint('✓', 'green')} Simplebeacon running in read-only mode`,
        options.offline
            ? `${paint('✓', 'green')} Offline mode — scan fails if any network activity is detected`
            : `${paint('✓', 'green')} Local-only scan — code is not transmitted unless you pass --upload`,
        `${paint('✓', 'green')} Your source files are never modified by Simplebeacon`
    ];
    for (const line of lines) {
        console.error(line);
    }
    console.error('');
}

function printTrustCompletion(options = {}, paint = (text) => text) {
    if (options.quiet) return;
    if (options.networkEventCount === 0) {
        console.error(paint('✓ No network activity detected during scan', 'green'));
    } else if (!options.offline) {
        console.error(paint(`Network activity: ${options.networkEventCount} request(s) (use --offline to enforce zero)`, 'yellow'));
    }
}

module.exports = {
    createNetworkGuard,
    snapshotFileState,
    assertFileUnchanged,
    printTrustBanner,
    printTrustCompletion
};
