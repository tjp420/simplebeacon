# Simplebeacon Marketing Claims — Verified Mapping

Use this document for website copy, README, and sales material. Each claim maps to a **rule**, **scope**, and **how to verify**.

---

## Approved claims (use these)

### 1. Mock data leaking into production code

**Claim:** Detects hardcoded references to `-sample.json`, mock/fixture paths, and `web/data` in production directories.

| | |
|---|---|
| **Rule** | `production-leak` |
| **Scans** | `server/`, `src/`, `app/`, `lib/` (configurable) |
| **Severity** | high/medium (profile-dependent) |
| **Verify** | `npx simplebeacon scan --verbose` → Production files scanned |
| **Caveat** | Intentional seed files should be allowlisted (`allowlistFiles` in config) |

---

### 2. Credential patterns in repo

**Claim:** Detects AWS keys, GitHub PATs, OpenAI keys, JWTs, Stripe keys, and private key blocks.

| | |
|---|---|
| **Rule** | `credentials` |
| **Scans** | Mock JSON dirs **and** production code paths (`scanProduction: true`) |
| **Severity** | high/medium |
| **Verify** | Unit test in `packages/simplebeacon-cli/tests/rules.test.js` |
| **Caveat** | Pattern-based — not a replacement for GitHub secret scanning or full SAST |

---

### 3. JSON schema drift in sample files

**Claim:** Validates `*-sample.json` files against registered page specs.

| | |
|---|---|
| **Rule** | `json-schema` |
| **Scans** | Files matching specs in `PAGE_SAMPLE_SPECS` under `scanPaths` |
| **Severity** | high |
| **Verify** | Break a required field in any spec'd sample → gate fails |

---

### 4. Fiction KPIs in sample JSON

**Claim:** Flags known legacy rejected fiction metrics (47 features, 74.17% completion, confidence not instrumented, etc.) in sample files.

| | |
|---|---|
| **Rule** | `sample-consistency` → `deepIncludesFiction` |
| **Scans** | **All** `*-sample.json` in `sampleDir` (v1.0.1+) |
| **Patterns** | From `.simplebeacon/baseline.json` → `rejectedFiction` |
| **Severity** | high |
| **Verify** | Drop `totalFeatures: <rejected-feature-count>` into any `web/data/*-sample.json` → Fictional KPI |
| **Caveat** | Does **not** scan arbitrary `.js` source for fiction. Comparison lenses (`ggufReport`, `aiReport`, `differences`, `visualComparison`) are skipped. |

---

### 5. Cross-sample KPI drift

**Claim:** Anchor samples stay aligned on Jest counts, dataSource, and release milestones.

| | |
|---|---|
| **Rule** | `sample-consistency` → drift checks |
| **Scans** | `consistencyAnchorSamples` only (6 files in cascade profile) |
| **Severity** | medium/low |
| **Verify** | Change `jestTests` in `dashboard-home-sample.json` → Jest Count Mismatch |

---

### 6. Fast CI gate

**Claim:** Sub-second scan on typical mock-data repos.

| | |
|---|---|
| **Measured** | ~0.2s for 41 files / 281KB (ai-platform) |
| **Verify** | `npx simplebeacon scan` with timing |
| **Caveat** | `--with-jest` adds full test suite runtime |

---

## Do NOT claim (unsupported or misleading)

| Don't say | Why |
|-----------|-----|
| "Detects all AI-generated fiction in code" | No JS fiction heuristic; JSON samples only |
| "85–90% audit time reduction" | No measured case study |
| "Zero production incidents" | Leak findings need human review / allowlists |
| "Comprehensive security scanner" | Credential patterns only, not full SAST |
| "Scans entire codebase for mock data" | Scoped to configured `scanPaths` + production dirs |
| "30 second scan time" | Actually much faster; undermines credibility |

---

## Profile-specific behavior

| Profile | Rules enabled | Fiction patterns | Use case |
|---------|---------------|------------------|----------|
| `minimal` | credentials, production-leak | none | Any Node repo, quick start |
| `standard` | all rules | generic fiction list | External projects with samples |
| `cascade` | all + allowlists | cascade fiction list | ai-platform monorepo |

---

## Verification checklist (before publishing copy)

```bash
# 1. Package tests
cd packages/simplebeacon-cli && npm test

# 2. Dogfood gate
cd ai-platform && npm run simplebeacon:full

# 3. Fiction detection smoke test
# Add totalFeatures: <rejected-feature-count> to any *-sample.json → expect Fictional KPI

# 4. Credential smoke test
# Add AKIA1A2B3C4D5E6F7G8H to a scanned JSON file → expect Credential Pattern

# 5. Production leak smoke test
# Add require('../web/data/foo-sample.json') in server/ → expect Production Leak
```

---

## One-liner (approved)

> **Simplebeacon gates CI on mock-data leaks in production code, credential patterns, JSON schema drift, and fiction KPIs in sample files.**

## Elevator pitch (approved)

> AI-assisted development leaves mock JSON, demo credentials, and inflated KPIs in repos. Simplebeacon scans your configured sample directories and production paths, validates schemas, and fails the build before fiction ships — in under a second for typical projects.

---

## Sales collateral

- Cold email kit: `docs/simplebeacon-cold-email-kit.md`
- Post-scan exec summary: `docs/simplebeacon-exec-summary-template.md`
- Pricing page copy: `docs/simplebeacon-pricing-page-copy.md`
- Enterprise MSA (draft): `docs/simplebeacon-enterprise-msa-template.md`

---

## Changelog vs validation report (May 2026)

| Validation report claim | Current status |
|-------------------------|----------------|
| 52 production leaks | **Fixed** — 0 leaks on ai-platform (pattern refinement + allowlists) |
| Fiction KPI detection false | **Fixed** — scans all `*-sample.json`; patterns include `62%`; comparison lenses skipped |
| Credentials JSON-only | **Fixed** — `scanProduction: true` scans JS/TS too |
| AI fiction in JS | **Still out of scope** — document as v1.2 roadmap item |
