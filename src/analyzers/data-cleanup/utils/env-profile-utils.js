/**
 * Group env files by deployment profile so dev/prod/example files are not cross-compared.
 */

const path = require('path');

function normalizeEnvRelativePath(relativePath) {
    return String(relativePath || '').replace(/\\/g, '/');
}

function resolveEnvProfileName(relativePath) {
    const rel = normalizeEnvRelativePath(relativePath);
    const base = path.posix.basename(rel);
    if (/^\.env\.production(\.|$)/.test(base) || base === '.env.production') {
        return 'production';
    }
    if (/^\.env\.v1-internal(\.|$)/.test(base)) {
        return 'v1-internal';
    }
    if (/^\.env\.development(\.|$)/.test(base)) {
        return 'development';
    }
    if (base === '.env' || /^\.env\./.test(base)) {
        return 'default';
    }
    return base;
}

function resolveEnvProfileGroup(relativePath) {
    const rel = normalizeEnvRelativePath(relativePath);
    const dir = path.posix.dirname(rel);
    const dirKey = dir === '.' ? 'root' : dir;
    return `${dirKey}:${resolveEnvProfileName(relativePath)}`;
}

function isExampleEnvFile(relativePath) {
    const base = path.posix.basename(normalizeEnvRelativePath(relativePath)).toLowerCase();
    return base.includes('.example') || base.includes('.template');
}

function isPlaceholderEnvValue(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return true;
    return /^(replace|your_|sk_test_|sk_live_|rk_live_|whsec_|price_|\.\.\.|changeme|dummy|placeholder|test-token)/i.test(trimmed)
        || /REPLACE_ME/i.test(trimmed)
        || /REPLACE_ON/i.test(trimmed)
        || /^replace-with-/i.test(trimmed);
}

function isTemplateEnvFile(relativePath) {
    const base = path.posix.basename(normalizeEnvRelativePath(relativePath)).toLowerCase();
    return base.includes('.template');
}

function shouldSkipEnvInconsistency(key, values) {
    if (!values || values.length <= 1) return true;

    const files = values.map((entry) => entry.file);
    if (files.some((file) => isTemplateEnvFile(file))) {
        return true;
    }

    const hasExample = files.some((file) => isExampleEnvFile(file));
    const hasLive = files.some((file) => !isExampleEnvFile(file));

    if (hasExample && hasLive) {
        if (/^(JWT_|.*_SECRET|.*_PASSWORD|STRIPE_|.*_KEY|DB_PASSWORD|DATABASE_URL)/i.test(key)) {
            return true;
        }
        // Example templates document defaults; production toggles feature flags independently.
        if (/^SIMPLEBEACON_/i.test(key)) {
            return true;
        }
        if (values.some((entry) => isPlaceholderEnvValue(entry.value))) {
            return true;
        }
        if (/^(ENABLE_DATABASE|ENABLE_REDIS|NODE_ENV)$/i.test(key)) {
            return true;
        }
    }

    return false;
}

/** Keys documented for phase-2 SSO — may be unset until auth providers ship */
const PLANNED_ENV_KEY_PREFIXES = [
    /^AZURE_AD_/,
    /^GOOGLE_/,
    /^OKTA_/,
    /^LDAP_/,
    /^SAML_/
];

const PLANNED_ENV_KEYS = new Set([
    'GOOGLE_SSO_ENABLED',
    'BASE_URL',
    'APP_URL',
    'REACT_APP_URL',
    'EMAIL_FROM',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SIMPLEBEACON_RELOAD_SCANNERS',
    'SIMPLEBEACON_DASHBOARD_BUILD',
    'STRIPE_CHECKOUT_MODE_TEAMS_MONTHLY'
]);

/** Keys with in-code defaults — optional in .env.example */
const OPTIONAL_ENV_KEYS_WITH_CODE_DEFAULTS = new Set([
    'SIMPLEBEACON_SALES_COMMISSIONS_STORE'
]);

function isPhase2ExampleEnvFile(relativePath) {
    const base = path.posix.basename(normalizeEnvRelativePath(relativePath)).toLowerCase();
    return base.includes('.env.example.phase2')
        || base.includes('.env.phase2');
}

function isPlannedEnvKey(key) {
    if (PLANNED_ENV_KEYS.has(key)) return true;
    if (OPTIONAL_ENV_KEYS_WITH_CODE_DEFAULTS.has(key)) return true;
    return PLANNED_ENV_KEY_PREFIXES.some((pattern) => pattern.test(key));
}

function isRuntimeInjectedEnvKey(key) {
    return /^(CI|NODE_ENV|FORCE_COLOR|NO_COLOR|DOTENV_CONFIG_PATH|npm_lifecycle_event|npm_node_execpath)$/i.test(key)
        || /^GITHUB_/i.test(key)
        || /^npm_config_/i.test(key)
        || /^(USERPROFILE|HOME|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|TEMP|TMP|PATH|PATHEXT|OS|COMPUTERNAME|USERNAME)$/i.test(key);
}

function isNonProductionSourcePath(relativePath) {
    const rel = normalizeEnvRelativePath(relativePath).toLowerCase();
    return /(^|\/)(tests?|__tests__|fixtures?|docs?|examples?)(\/|$)/.test(rel)
        || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)
        || /(^|\/)tests\/fixtures\//.test(rel);
}

module.exports = {
    normalizeEnvRelativePath,
    resolveEnvProfileName,
    resolveEnvProfileGroup,
    isExampleEnvFile,
    isTemplateEnvFile,
    isPhase2ExampleEnvFile,
    isPlaceholderEnvValue,
    shouldSkipEnvInconsistency,
    isPlannedEnvKey,
    isOptionalEnvKeyWithCodeDefault: (key) => OPTIONAL_ENV_KEYS_WITH_CODE_DEFAULTS.has(key),
    isRuntimeInjectedEnvKey,
    isNonProductionSourcePath
};
