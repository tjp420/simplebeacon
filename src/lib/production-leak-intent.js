/**
 * Classify production-leak pattern matches — separate repository-audit
 * infrastructure from accidental sample paths in shipping code.
 */

const REPOSITORY_AUDIT_INFRA_FILES = new Set([
    'sample-path-resolver.js',
    'snapshot-seeds.js',
    'snapshot-resolver.js',
    'mock-data-schema-validator.js',
    'sample-consistency-checker.js',
    'roadmap-json-specs.js',
    'page-sample-specs.js',
    'sample-path-resolver.js',
    'code-roadmap-generator.js',
    'mock-data-scanner.js',
    'dev-tools-workflows.js'
]);

const SCANNER_IMPL_PATH_RE = /(?:^|\/)packages\/simplebeacon-cli\/src\/(?:rules|reporters|analyzers|lib|proxy)(?:\/|$)/;

const REPOSITORY_AUDIT_MARKERS = [
    /repository-audit/i,
    /PAGE_SAMPLE_SPECS/,
    /resolveSampleFilePath/,
    /SAMPLE_FILE_OVERRIDES/,
    /SNAPSHOT_SEEDS/,
    /AUDIT_SAMPLE_FILES/,
    /dataSource\s*[:=]\s*['"]repository-audit['"]/
];

function normalizeRel(relativePath) {
    return String(relativePath || '').replace(/\\/g, '/');
}

function basename(relativePath) {
    const normalized = normalizeRel(relativePath);
    const parts = normalized.split('/');
    return parts[parts.length - 1] || normalized;
}

function isRepositoryAuditInfraFile(relativePath) {
    return REPOSITORY_AUDIT_INFRA_FILES.has(basename(relativePath));
}

function isScannerImplementationPath(relativePath) {
    return SCANNER_IMPL_PATH_RE.test(normalizeRel(relativePath).toLowerCase());
}

function fileDeclaresRepositoryAudit(content) {
    return REPOSITORY_AUDIT_MARKERS.some((re) => re.test(content));
}

function isCatalogSampleReference(line) {
    const trimmed = String(line || '').trim();
    return /^\w[\w$-]*\s*:\s*['"`][^'"`]*-sample\.json['"`]/.test(trimmed)
        || /^\w[\w$-]*\s*:\s*['"`][^'"`]*-sample\.json['"`],?\s*$/.test(trimmed);
}

function isSampleDirConfigReference(line) {
    return /sampleDir\s*[:=]/.test(String(line || ''));
}

function isSnapshotSeedEntry(line) {
    return /\bfile\s*:\s*['"`][^'"`]*-sample\.json['"`]/.test(String(line || ''));
}

function isStubApiSampleJoin(line) {
    const text = String(line || '');
    return /path\.join\s*\([^)]*['"]data['"][^)]*-sample\.json['"]/.test(text)
        || /path\.join\s*\([^)]*-sample\.json['"]/.test(text);
}

function isStubApiLoaderFile(relativePath) {
    return /stub-api\.js$/i.test(normalizeRel(relativePath));
}

function isPathJoinWebData(line) {
    return /join\s*\(\s*['"]web['"]\s*,\s*['"]data['"]/.test(String(line || ''));
}

const DEMO_TOOL_PATH_SEGMENTS = [
    '/example/',
    '/examples/',
    '/tools/',
    '/applets/',
    '/demos/',
    '/demo/'
];

function isDemoToolSamplePath(relativePath) {
    const normalized = normalizeRel(relativePath).toLowerCase();
    if (/\.(test|spec)\.(jsx?|tsx?|mjs|cjs)$/.test(normalized)) {
        return true;
    }
    return DEMO_TOOL_PATH_SEGMENTS.some((segment) => normalized.includes(segment));
}

function isPlainSampleJsonMatch(matchText) {
    return /sample\.json/i.test(String(matchText || '')) && !/-sample\.json/i.test(String(matchText || ''));
}

function isAccidentalLoadPattern(line, matchText) {
    const text = String(line || '');
    if (/\brequire\s*\(/.test(text) && /-sample\.json|\/mock\/|\/fixtures\//.test(matchText)) {
        return true;
    }
    if (/\brequire\s*\(/.test(text) && isPlainSampleJsonMatch(matchText)) {
        return true;
    }
    if (/\breadFile(?:Sync)?\s*\(/.test(text) && /-sample\.json|web[/\\]data/.test(matchText)) {
        return true;
    }
    if (/\breadFile(?:Sync)?\s*\(/.test(text) && isPlainSampleJsonMatch(matchText)) {
        return true;
    }
    if (/\bfetch\s*\(/.test(text) && /-sample\.json|\/data\//.test(matchText)) {
        return true;
    }
    if (/\bfetch\s*\(/.test(text) && isPlainSampleJsonMatch(matchText)) {
        return true;
    }
    if (/\bimport\s+.*from\s+['"`].*-sample\.json/.test(text)) {
        return true;
    }
    if (/\bimport\s+.*from\s+['"`][^'"`]*sample\.json/.test(text) && isPlainSampleJsonMatch(matchText)) {
        return true;
    }
    return false;
}

/**
 * @returns {{ intent: string, suppress: boolean, severityBand?: string, reason: string }}
 */
function classifyProductionLeakMatch({
    relativePath,
    content,
    lineIndex,
    matchText,
    patternId
}) {
    const line = (content || '').split('\n')[lineIndex] || '';
    const rel = normalizeRel(relativePath);

    if (isDemoToolSamplePath(rel)) {
        return {
            intent: 'demo-tool-sample',
            suppress: true,
            reason: 'Demo/example/tool applet path — intentional sample content'
        };
    }

    if (isScannerImplementationPath(rel)) {
        return {
            intent: 'scanner-meta',
            suppress: true,
            reason: 'Scanner implementation path'
        };
    }

    if (isRepositoryAuditInfraFile(rel)) {
        if (isSnapshotSeedEntry(line) || isPathJoinWebData(line) || isCatalogSampleReference(line)) {
            return {
                intent: 'repository-audit-loader',
                suppress: true,
                reason: 'Repository-audit seed/resolver catalog'
            };
        }
        if (fileDeclaresRepositoryAudit(content) && !isAccidentalLoadPattern(line, matchText)) {
            return {
                intent: 'repository-audit-loader',
                suppress: true,
                reason: 'Repository-audit infrastructure module'
            };
        }
    }

    if (isCatalogSampleReference(line)) {
        return {
            intent: 'config-metadata',
            suppress: true,
            reason: 'Sample filename catalog entry (not a runtime load)'
        };
    }

    if (isSampleDirConfigReference(line)) {
        return {
            intent: 'config-metadata',
            suppress: true,
            reason: 'sampleDir configuration reference'
        };
    }

    if (isStubApiLoaderFile(rel) && isStubApiSampleJoin(line)) {
        return {
            intent: 'repository-audit-stub-loader',
            suppress: true,
            reason: 'Dashboard stub API loads repository-audit page samples via path.join'
        };
    }

    if (isPathJoinWebData(line)) {
        return {
            intent: 'repository-audit-loader',
            suppress: true,
            reason: 'web/data path join helper'
        };
    }

    if (fileDeclaresRepositoryAudit(content) && isCatalogSampleReference(line)) {
        return {
            intent: 'repository-audit-loader',
            suppress: true,
            reason: 'Catalog inside repository-audit module'
        };
    }

    if (isAccidentalLoadPattern(line, matchText)) {
        return {
            intent: 'accidental-leak',
            suppress: false,
            severityBand: patternId === 'sample-json' || patternId === 'web-data-sample'
                ? 'critical'
                : patternId === 'plain-sample-json'
                    ? 'high'
                    : 'high',
            reason: 'Runtime load of mock/sample path'
        };
    }

    return {
        intent: 'unclassified',
        suppress: false,
        reason: 'Mock/sample path reference in production-eligible code'
    };
}

module.exports = {
    REPOSITORY_AUDIT_INFRA_FILES,
    classifyProductionLeakMatch,
    isRepositoryAuditInfraFile,
    isCatalogSampleReference,
    isAccidentalLoadPattern,
    isDemoToolSamplePath,
    isPlainSampleJsonMatch
};
