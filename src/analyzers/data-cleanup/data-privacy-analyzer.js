/**
 * Detect PII and sensitive data in mock/config/data files.
 */

const fs = require('fs');
const { scanTextContent } = require('../../lib/credential-pattern-scanner');
const { isDataFile, isDataPath } = require('./utils/data-file-utils');

const PII_PATTERNS = [
    {
        id: 'realistic-email',
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        allowSubstrings: ['example.com', 'example.org', 'test.com', 'simplebeacon.ai', 'localhost', 'user@domain']
    },
    {
        id: 'ssn-pattern',
        regex: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
        allowSubstrings: []
    },
    {
        id: 'credit-card',
        regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
        allowSubstrings: ['4111111111111111', '4242424242424242']
    }
];

const SCANNABLE_EXTENSIONS = new Set(['.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.env', '.yaml', '.yml', '.csv', '.md']);

function isDocumentationPath(relativePath) {
    const normalized = String(relativePath || '').replace(/\\/g, '/');
    return /^docs\//i.test(normalized) || /MOCK_DATA_GUIDE\.md$/i.test(normalized);
}

function isCommentOrDocLine(line) {
    return /^\s*(\/\/|#|\*)/.test(String(line || ''));
}

function confidenceScoreForPattern(patternId) {
    if (patternId === 'ssn-pattern') return 0.9;
    if (patternId === 'credit-card') return 0.85;
    return 0.5;
}

function scanPiiContent(relativePath, content) {
    if (isDocumentationPath(relativePath)) {
        return [];
    }

    const findings = [];
    const lines = String(content || '').split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        if (isCommentOrDocLine(line)) continue;

        for (const pattern of PII_PATTERNS) {
            pattern.regex.lastIndex = 0;
            let match = pattern.regex.exec(line);
            while (match) {
                const snippet = line.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20).toLowerCase();
                if (pattern.allowSubstrings.some((allowed) => snippet.includes(allowed.toLowerCase()))) {
                    match = pattern.regex.exec(line);
                    continue;
                }
                findings.push({
                    type: 'data-privacy',
                    path: relativePath,
                    reason: `Possible ${pattern.id.replace(/-/g, ' ')} in data file`,
                    severity: pattern.id === 'ssn-pattern' ? 'high' : 'medium',
                    confidence: 'medium',
                    action: 'remove-or-tokenize-pii',
                    metadata: {
                        patternId: pattern.id,
                        line: lineIndex + 1,
                        confidenceScore: confidenceScoreForPattern(pattern.id)
                    }
                });
                match = pattern.regex.exec(line);
            }
        }
    }
    return findings;
}

class DataPrivacyAnalyzer {
    async scan(projectRoot, options = {}) {
        const inventory = options.inventory;
        const targets = inventory.files.filter((file) =>
            SCANNABLE_EXTENSIONS.has(file.ext) && (isDataFile(file) || isDataPath(file.relativePath))
        );

        const findings = [];
        for (const file of targets) {
            if (file.size > 512000) continue;
            let content = '';
            try {
                content = await fs.promises.readFile(file.path, 'utf8');
            } catch {
                continue;
            }

            for (const hit of scanTextContent(file.relativePath, content)) {
                findings.push({
                    type: 'data-privacy',
                    path: file.relativePath,
                    reason: `Credential pattern (${hit.pattern}) in data file`,
                    severity: hit.severityBand === 'critical' ? 'high' : 'medium',
                    confidence: 'high',
                    action: 'rotate-and-remove-secret',
                    metadata: { line: hit.line, patternId: hit.pattern }
                });
            }

            findings.push(...scanPiiContent(file.relativePath, content));
        }

        const deduped = [];
        const seen = new Set();
        for (const finding of findings) {
            const key = `${finding.path}:${finding.metadata?.patternId}:${finding.metadata?.line}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(finding);
        }

        return {
            scanner: 'data-privacy',
            findings: deduped,
            summary: {
                dataFilesScanned: targets.length,
                privacyFindings: deduped.length,
                credentialHits: deduped.filter((f) => f.reason.includes('Credential')).length,
                piiHits: deduped.filter((f) => !f.reason.includes('Credential')).length
            }
        };
    }
}

module.exports = {
    DataPrivacyAnalyzer,
    scanPiiContent,
    PII_PATTERNS
};
