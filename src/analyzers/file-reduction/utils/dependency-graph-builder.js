/**
 * Build import/reference graph from parsed module references.
 */

const path = require('path');

function buildDependencyGraph(imports, projectRoot) {
    const nodes = new Map();

    function ensureNode(filePath) {
        const key = path.resolve(filePath);
        if (!nodes.has(key)) {
            nodes.set(key, {
                path: key,
                relativePath: path.relative(projectRoot, key).split(path.sep).join('/'),
                imports: [],
                importedBy: []
            });
        }
        return nodes.get(key);
    }

    for (const entry of imports) {
        if (!entry.resolvedPath) continue;
        const sourceNode = ensureNode(entry.source);
        const targetNode = ensureNode(entry.resolvedPath);
        if (!sourceNode.imports.includes(targetNode.path)) {
            sourceNode.imports.push(targetNode.path);
        }
        if (!targetNode.importedBy.includes(sourceNode.path)) {
            targetNode.importedBy.push(sourceNode.path);
        }
    }

    return nodes;
}

function findUnreferencedNodes(graph, entryPoints = []) {
    const entrySet = new Set(entryPoints.map((p) => path.resolve(p)));
    const unreferenced = [];
    for (const node of graph.values()) {
        if (entrySet.has(node.path)) continue;
        if (node.importedBy.length === 0) {
            unreferenced.push(node);
        }
    }
    return unreferenced;
}

function findCircularDependencies(graph) {
    const cycles = [];
    const visiting = new Set();
    const visited = new Set();
    const stack = [];

    function dfs(nodePath) {
        if (visited.has(nodePath)) return;
        if (visiting.has(nodePath)) {
            const start = stack.indexOf(nodePath);
            if (start >= 0) cycles.push(stack.slice(start).concat(nodePath));
            return;
        }
        visiting.add(nodePath);
        stack.push(nodePath);
        const node = graph.get(nodePath);
        for (const target of node?.imports || []) {
            if (graph.has(target)) dfs(target);
        }
        stack.pop();
        visiting.delete(nodePath);
        visited.add(nodePath);
    }

    for (const nodePath of graph.keys()) {
        dfs(nodePath);
    }
    return cycles;
}

module.exports = {
    buildDependencyGraph,
    findUnreferencedNodes,
    findCircularDependencies
};
