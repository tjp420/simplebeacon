/**
 * Resolve dashboard sample JSON paths — some page samples alias canonical data files.
 */
const path = require('path');

/** Page sample filename → platform-relative canonical path */
const SAMPLE_FILE_OVERRIDES = {
    'ai-roadmap-sample.json': 'data/roadmap/ai-roadmap-report.json',
    'issue-resolution-sample.json': 'web/data/issue-resolution-sample.json',
    'simplebeacon-cli-dashboard-sample.json': 'web/data/simplebeacon-cli-sample.json'
};

function resolveSampleFilePath(platformRoot, sampleFileName) {
    const relative = SAMPLE_FILE_OVERRIDES[sampleFileName]
        || path.join('web', 'data', sampleFileName).replace(/\\/g, '/');
    if (path.isAbsolute(relative)) {
        return relative;
    }
    return path.join(platformRoot, ...relative.split('/'));
}

module.exports = {
    SAMPLE_FILE_OVERRIDES,
    resolveSampleFilePath
};
