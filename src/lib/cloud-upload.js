/**
 * Cloud upload helpers — teams scan archive + enterprise compliance ledger ingress.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const { sanitizeReportForCloudUpload } = require('./report-sanitizer');

const DEFAULT_APP_URL = 'https://simplebeacon.ai';

function resolveAppBaseUrl(override) {
    const raw = String(override || process.env.SIMPLEBEACON_APP_URL || DEFAULT_APP_URL).trim();
    return raw.replace(/\/+$/, '');
}

function resolveUploadEndpoint(tier, baseUrl) {
    const normalized = String(tier || 'enterprise').toLowerCase();
    if (normalized === 'enterprise' || normalized === 'compliance') {
        return `${baseUrl}/api/compliance-trail/ingress`;
    }
    return `${baseUrl}/api/simplebeacon/cloud-scan`;
}

function resolveGitMetadata(cwd, overrides = {}) {
    if (overrides.repository) {
        return {
            repository: overrides.repository,
            branch: overrides.branch || 'main'
        };
    }

    try {
        const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        const match = remote.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
        const branch = overrides.branch
            || execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
                cwd,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim();
        const folder = path.basename(cwd);
        return {
            repository: match ? match[1] : `local/${folder}`,
            branch: branch || 'main'
        };
    } catch {
        const folder = path.basename(cwd);
        return {
            repository: `local/${folder}`,
            branch: overrides.branch || 'main'
        };
    }
}

async function postJson(url, token, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-simplebeacon-token': token,
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || data.error || `Upload failed (${response.status})`);
    }
    return data;
}

async function uploadCloudScanReport({ baseUrl, token, report }) {
    if (!token) {
        throw new Error('API token required — pass --api-token or set SIMPLEBEACON_TOKEN');
    }
    return postJson(
        resolveUploadEndpoint('teams', baseUrl),
        token,
        { report: sanitizeReportForCloudUpload(report) }
    );
}

async function uploadComplianceLedgerReport(options = {}) {
    const {
        baseUrl = resolveAppBaseUrl(),
        token,
        report,
        cwd = process.cwd(),
        repository,
        branch,
        actorLogin = process.env.USER || process.env.USERNAME || 'cli',
        sha = null
    } = options;

    if (!token) {
        throw new Error('API token required — pass --api-token or set SIMPLEBEACON_TOKEN');
    }

    const git = resolveGitMetadata(cwd, { repository, branch });
    return postJson(resolveUploadEndpoint('enterprise', baseUrl), token, {
        report: sanitizeReportForCloudUpload(report),
        repository: git.repository,
        branch: git.branch,
        actor_login: actorLogin,
        sha
    });
}

module.exports = {
    DEFAULT_APP_URL,
    resolveAppBaseUrl,
    resolveUploadEndpoint,
    resolveGitMetadata,
    uploadCloudScanReport,
    uploadComplianceLedgerReport
};
