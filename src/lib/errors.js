/**
 * Typed errors for Simplebeacon CLI and library API.
 */

class SimplebeaconError extends Error {
    constructor(message, code, context = {}) {
        super(message);
        this.name = 'SimplebeaconError';
        this.code = code;
        this.context = context;
    }
}

class ConfigError extends SimplebeaconError {
    constructor(message, context = {}) {
        super(message, 'CONFIG_ERROR', context);
        this.name = 'ConfigError';
    }
}

class ScanError extends SimplebeaconError {
    constructor(message, context = {}) {
        super(message, 'SCAN_ERROR', context);
        this.name = 'ScanError';
    }
}

class PathError extends SimplebeaconError {
    constructor(message, context = {}) {
        super(message, 'PATH_ERROR', context);
        this.name = 'PathError';
    }
}

module.exports = {
    SimplebeaconError,
    ConfigError,
    ScanError,
    PathError
};
