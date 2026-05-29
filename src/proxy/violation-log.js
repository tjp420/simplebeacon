const fs = require('fs');
const path = require('path');

function resolveLogPath(projectRoot) {
    return path.join(path.resolve(projectRoot || process.cwd()), '.simplebeacon', 'proxy-violations.jsonl');
}

function appendViolationLog(projectRoot, entry) {
    const logPath = resolveLogPath(projectRoot);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const line = `${JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry
    })}\n`;
    fs.appendFileSync(logPath, line, { encoding: 'utf8' });
    return logPath;
}

module.exports = {
    resolveLogPath,
    appendViolationLog
};
