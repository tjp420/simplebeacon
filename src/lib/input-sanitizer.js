/**
 * Sanitize user-supplied CLI and config strings.
 */

const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

function sanitizeFilePath(input) {
    if (input == null) return '';
    return String(input).replace(CONTROL_CHARS, '').trim();
}

function sanitizeString(input, maxLength = 1000) {
    if (input == null) return '';
    return String(input).replace(CONTROL_CHARS, '').trim().slice(0, maxLength);
}

module.exports = {
    sanitizeFilePath,
    sanitizeString
};
