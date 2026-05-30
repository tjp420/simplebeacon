const { scanTextContent } = require('../lib/credential-pattern-scanner');
const { scanFileContent } = require('../rules/production-leak');

const OUTBOUND_VIRTUAL_PATH = 'proxy/outbound-prompt.txt';

function scanOutboundText(text, options = {}) {
    if (!text || typeof text !== 'string') {
        return { blocked: false, findings: [] };
    }

    const credentialFindings = scanTextContent('outbound-prompt.txt', text, OUTBOUND_VIRTUAL_PATH);
    const leakResult = scanFileContent(OUTBOUND_VIRTUAL_PATH, text, {
        severityBand: 'high',
        intentClassification: false
    });

    const findings = [...credentialFindings, ...leakResult.findings];
    const blocked = findings.some((issue) => {
        const band = issue.severityBand || issue.severity;
        return band === 'critical' || band === 'high' || issue.severity === 'high';
    }) || options.blockMedium === true && findings.some((i) => (i.severityBand || i.severity) === 'medium');

    return { blocked, findings };
}

function extractPromptText(bodyString) {
    if (!bodyString) return '';

    try {
        const payload = JSON.parse(bodyString);
        if (typeof payload.prompt === 'string') return payload.prompt;
        if (typeof payload.input === 'string') return payload.input;
        if (Array.isArray(payload.messages)) {
            return payload.messages.map((m) => {
                if (typeof m.content === 'string') return m.content;
                if (Array.isArray(m.content)) {
                    return m.content.map((part) => part.text || part.content || '').join('\n');
                }
                return '';
            }).join('\n');
        }
        if (Array.isArray(payload.input)) {
            return payload.input.map((block) => {
                if (typeof block === 'string') return block;
                if (block?.type === 'text' && typeof block.text === 'string') return block.text;
                return JSON.stringify(block);
            }).join('\n');
        }
    } catch {
        /* fall through */
    }

    return bodyString;
}

module.exports = {
    scanOutboundText,
    extractPromptText,
    OUTBOUND_VIRTUAL_PATH
};
