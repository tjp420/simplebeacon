# Performance benchmarks

Methodology and raw numbers for the [Anti-Bloat Manifesto](./ANTI-BLOAT-MANIFESTO.md).

Environment: Windows 10, Node 20, `ai-platform` checkout, May 2026.

## Micro-benchmarks (pattern engine)

Run:

```bash
cd packages/simplebeacon-cli
node -e "
const { performance } = require('perf_hooks');
const { scanTextContent } = require('./src/lib/credential-pattern-scanner');
const fs = require('fs');
const sample = fs.readFileSync('README.md', 'utf8');
for (let i = 0; i < 20; i++) scanTextContent('t', sample);
const t0 = performance.now();
for (let i = 0; i < 500; i++) scanTextContent('t', sample);
console.log('credential scan per call ms:', ((performance.now()-t0)/500).toFixed(4));
"
```

| Benchmark | Iterations | Per call |
|-----------|------------|----------|
| `scanTextContent` (README-sized ~7KB) | 500 | ~0.022 ms |
| `scanTextContent` (200× README) | 100 | ~3.8 ms |
| `scanEnterprisePatterns` (README-sized) | 500 | ~0.14 ms |
| `scanEnterprisePatterns` (200× README) | 100 | ~22 ms |

## End-to-end CLI

```bash
node packages/simplebeacon-cli/bin/simplebeacon.js scan --path . --gate --no-trust-banner
```

| Repo | Time | Exit |
|------|------|------|
| `ai-platform/` (cascade profile) | ~4.0 s | 0 |

Scoped scans are faster; full monorepo universal analyzer runs can take minutes — use subdirectory paths for CI if needed.

## Dependency count

```bash
node -e "console.log(require('./packages/simplebeacon-cli/package.json').dependencies||'none')"
```

Runtime dependencies: **none** (dev/test only via Node built-ins).

## CI simulation tests

```bash
cd packages/simplebeacon-cli && node --test tests/github-action.test.js
```

Validates workflow YAML and gate pass/fail on synthetic repos.
