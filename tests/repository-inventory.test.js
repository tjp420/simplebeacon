const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { countRepositoryInventory } = require('../src/lib/repository-inventory');

test('countRepositoryInventory counts files and folders under a tree', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-inv-'));
    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a', 'one.txt'), '1');
    fs.writeFileSync(path.join(root, 'a', 'b', 'two.txt'), '2');

    const inventory = await countRepositoryInventory(root, { profile: 'explorer' });
    assert.equal(inventory.totalFiles, 2);
    assert.equal(inventory.totalFolders, 2);
    assert.equal(path.resolve(inventory.projectRoot), path.resolve(root));

    fs.rmSync(root, { recursive: true, force: true });
});
