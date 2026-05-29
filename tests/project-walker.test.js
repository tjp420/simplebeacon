const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { walkProjectFiles } = require('../src/analyzers/file-reduction/utils/project-walker');

test('walkProjectFiles skips github-cache and node_modules', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sb-walk-'));
    try {
        await fs.promises.mkdir(path.join(root, 'src'), { recursive: true });
        await fs.promises.writeFile(path.join(root, 'src', 'app.js'), 'export {};\n', 'utf8');
        await fs.promises.mkdir(path.join(root, 'github-cache', 'clone', 'pkg'), { recursive: true });
        await fs.promises.writeFile(path.join(root, 'github-cache', 'clone', 'pkg', 'noise.js'), 'x\n', 'utf8');
        await fs.promises.mkdir(path.join(root, 'node_modules', 'dep'), { recursive: true });
        await fs.promises.writeFile(path.join(root, 'node_modules', 'dep', 'index.js'), 'x\n', 'utf8');

        const { files, directories } = await walkProjectFiles(root);
        const rels = files.map((f) => f.relativePath);
        assert.ok(rels.includes('src/app.js'));
        assert.equal(rels.some((r) => r.includes('github-cache')), false);
        assert.equal(rels.some((r) => r.includes('node_modules')), false);
        assert.equal(directories.some((d) => d.name === 'node_modules' && d.skipped), true);
    } finally {
        await fs.promises.rm(root, { recursive: true, force: true });
    }
});
