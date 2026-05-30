# Rules Reference

## credentials

Scans mock data directories and production paths for secret patterns.

**Detects:**
- AWS access keys (`AKIA...`)
- GitHub PATs (`ghp_...`, `gho_...`)
- OpenAI keys (`sk-...`)
- JWT tokens
- Slack tokens
- Stripe keys
- Private key blocks
- Generic `api_key=` / `secret_key=` assignments

**Allowlisted:** demo placeholders, `REPLACE_ME`, `AKIAIOSFODNN7EXAMPLE`

**Config:**
```json
"credentials": { "enabled": true, "scanProduction": true }
```

## json-schema

Validates `*-sample.json` files against registered page specs.

**Detects:** missing required keys, type mismatches, empty required arrays

**Note:** Cascade dashboard ships 41 specs; generic repos can disable this rule.

## sample-consistency

Cross-checks sample JSON against `.simplebeacon/baseline.json`.

**Detects:**
- **Fiction KPIs** in **all** `*-sample.json` files under `sampleDir` (v1.0.1+)
- **Drift** (Jest counts, dataSource, release) in `consistencyAnchorSamples` only

**Fiction patterns** (configurable via `baseline.rejectedFiction`):
- Feature counts (`totalFeatures` key only): `47`, `8`, `9`, `100`, `156`
- Completion rates: `74.17`, `62`, `87`, `94.3`, `66`
- AI confidence: `98.5`, `94.3`
- Model names: `unbreakable-oracle`, `demo-oracle`
- Open issues: `156`, throughput: `1559`
- Stale roadmap template: Sprint 3 `in-progress` at `75%`, or `totalFeatures: <rejected-feature-count>` with `completionRate: <rejected-completion-rate>`

**Comparison samples:** fiction inside `ggufReport`, `aiReport`, `differences`, or `visualComparison` is skipped — those blocks document alternate analytical lenses, not the measured baseline.

**Config:** set `consistencyAnchorSamples` to files used for KPI drift checks, or disable for generic repos.

## roadmap

Validates `data/roadmap/*.json` structural specs.

**Detects:** missing files, invalid JSON, legacy fiction exports (archived files skipped)

## production-leak

Scans production code for hardcoded mock/sample paths.

**Detects:**
- `-sample.json` string references
- `/mock/`, `/fixtures/` paths
- `web/data` references
- Template literals containing sample/mock paths
- Optional `plainSampleJson`: bare `sample.json` imports/fetches (cascade profile only by default)

**Suppresses (intent classification):** repository-audit catalogs, stub loaders, and demo paths (`example/`, `tools/`, `applets/`, `*.test.*`).

**Skips:** comment lines, webpack/jest config files, simplebeacon allowlisted files

**Config:**
```json
"production-leak": {
  "enabled": true,
  "severity": "high",
  "productionPaths": ["src/", "server/"],
  "plainSampleJson": false,
  "intentClassification": true,
  "allowlistFiles": ["server/lib/seeds.js"]
}
```

## jest-baseline

Runs `npm test` and compares pass counts to baseline.

**Enable:** `"jest-baseline": { "enabled": true, "runTests": true }` or `--with-jest`

**Slow:** intended for CI nightly or pre-release, not every PR.
