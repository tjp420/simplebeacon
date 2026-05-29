/**
 * Parse .env-style files into key/value maps.
 */

function parseEnvFile(content) {
    const entries = new Map();
    const lines = String(content || '').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
        const raw = lines[index].trim();
        if (!raw || raw.startsWith('#')) continue;
        const normalized = raw.startsWith('export ') ? raw.slice(7).trim() : raw;
        const eq = normalized.indexOf('=');
        if (eq <= 0) continue;
        const key = normalized.slice(0, eq).trim();
        let value = normalized.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        entries.set(key, { value, line: index + 1 });
    }
    return entries;
}

module.exports = {
    parseEnvFile
};
