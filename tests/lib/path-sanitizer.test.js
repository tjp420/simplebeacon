const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PathSanitizer, sanitizePath } = require('../../src/lib/path-sanitizer');
const { PathError } = require('../../src/lib/errors');
const { normalizePathKey } = require('../../src/lib/path-utils');

test('PathSanitizer allows paths inside the base directory', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'simplebeacon-sanitize-'));
    const child = path.join(base, 'web', 'data');

    try {
        fs.mkdirSync(child, { recursive: true });
        const sanitizer = new PathSanitizer(base);
        const resolved = sanitizer.sanitize('web/data');

        assert.equal(normalizePathKey(resolved), normalizePathKey(child));
    } finally {
        fs.rmSync(base, { recursive: true, force: true });
    }
});

test('PathSanitizer blocks relative traversal outside base', () => {
    const base = path.join(os.tmpdir(), 'simplebeacon-sanitize-root');
    const sanitizer = new PathSanitizer(base);

    assert.throws(
        () => sanitizer.sanitize('../outside'),
        (error) => error instanceof PathError && error.code === 'PATH_ERROR'
    );
});

test('PathSanitizer rejects prefix bypass paths', () => {
    const base = path.join(os.tmpdir(), 'simplebeacon-repo');
    const lookalike = `${base}-evil`;
    const sanitizer = new PathSanitizer(base);

    assert.throws(
        () => sanitizer.sanitize(lookalike, { allowAbsoluteOutside: false }),
        PathError
    );
    assert.equal(sanitizer.isWithinBaseDir(lookalike), false);
});

test('PathSanitizer.safeJoin blocks escaped segments', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'simplebeacon-safejoin-'));

    try {
        const sanitizer = new PathSanitizer(base);
        assert.throws(() => sanitizer.safeJoin('..', 'etc', 'passwd'), PathError);
    } finally {
        fs.rmSync(base, { recursive: true, force: true });
    }
});

test('PathSanitizer allows absolute scan roots by default', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'simplebeacon-abs-'));

    try {
        const sanitizer = new PathSanitizer(base);
        const resolved = sanitizer.sanitize(base);
        assert.equal(normalizePathKey(resolved), normalizePathKey(base));
    } finally {
        fs.rmSync(base, { recursive: true, force: true });
    }
});

test('sanitizePath strips control characters before resolving', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'simplebeacon-control-'));
    const child = path.join(base, 'data');

    try {
        fs.mkdirSync(child, { recursive: true });
        const resolved = sanitizePath(`data\x00`, base);
        assert.equal(normalizePathKey(resolved), normalizePathKey(child));
    } finally {
        fs.rmSync(base, { recursive: true, force: true });
    }
});
