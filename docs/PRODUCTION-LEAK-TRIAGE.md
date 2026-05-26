# Production Leak Triage — Cascade ai-platform

This document categorizes production-leak findings for the **cascade** profile (`.simplebeacon/config.json`).

**Current gate status (2026-05-24):** `productionLeakFindings: 0` with cascade config — **Gate PASS**.

The historical **52 medium findings** in `.simplebeacon/test-report.json` are documented below for outreach demos and allowlist decisions.

---

## Scan configuration (cascade profile)

| Setting | Value |
|---------|--------|
| `productionPaths` | `server/` only |
| `severity` | `medium` (warn, does not fail gate) |
| `gate.failOn` | `high` only |
| **Allowlisted files** | See Tier A below |

**Why gate passes with zero leaks:** Non-allowlisted server files no longer hardcode `-sample.json` paths. Sample loading is centralized in allowlisted seed/resolver modules.

---

## Tier A — Intentional allowlist (keep)

These files **should** reference sample JSON. They are excluded from production-leak scanning.

| File | Role | Hits if unallowlisted |
|------|------|------------------------|
| `server/lib/snapshot-seeds.js` | Central registry mapping API keys → `*-sample.json` | ~87 |
| `server/lib/snapshot-resolver.js` | Resolves and loads sample files for stub API | varies |
| `server/lib/sample-path-resolver.js` | Maps page sample names → canonical data paths (dedup aliases) | 1 |
| `server/lib/code-roadmap-generator.js` | Scans `web/data` for roadmap analysis | ~5 |
| `server/services/model-inference-service.js` | GGUF analysis sample path constant | 1 |

**Verdict:** ✅ **Intentional architecture** — stub dashboard server serves measured samples from disk. Allowlist is correct.

---

## Tier B — Historical scattered refs (52 in test-report — resolved)

`test-report.json` recorded **52** production-leak hits across **22 server files** before centralization. Top files:

| File | Hits (historical) | Status today |
|------|-------------------|--------------|
| `server/middleware/auth.js` | 5 | ✅ Clean — 0 hits |
| `server/routes/upload.js` | 5 | ✅ Clean |
| `server/api/integration/APIGateway.js` | 4 | ✅ Clean |
| `server/middleware/resilience.js` | 4 | ✅ Clean |
| `server/services/cloud-inference-service.js` | 4 | ✅ Clean |
| `server/bootstrap/phase2-integration.js` | 3 | ✅ Clean |
| `server/dashboard-server.js` | 3 | ✅ Clean |
| `server/lib/file-merger-reduction-scanner.js` | 3 | ✅ Clean |
| `server/routes/auth.js` | 3 | ✅ Clean |
| + 13 more files | 1–2 each | ✅ Clean |

**Verdict:** ✅ **Resolved** — refs migrated to snapshot-seeds pattern or removed. No action unless regressions appear.

---

## Tier C — Extended scan: `src/` directory (not in cascade config)

If `productionPaths` includes `src/` (standard profile default), **46 additional hits** appear:

| File | Hits | Nature |
|------|------|--------|
| `src/api/dashboard-stub-api.js` | 30 | Intentional tier-1 stub route map |
| `src/web/export-mock-data.js` | 4 | Dev/export tooling |
| `src/web/scripts/continue-remediation.js` | 3 | Remediation scripts |
| `src/web/utils/mock-data-templates.js` | 3 | Template utilities |
| Others | 1–2 each | Export/remediation helpers |

**Verdict:** ⚠️ **Intentional for this monorepo** — but cascade profile **deliberately excludes `src/`** from production-leak scans to avoid noise. External customers using standard profile should either:

- Allowlist stub API files, or  
- Refactor to a single sample loader module (Tier A pattern)

---

## Pattern breakdown (historical 52 + src 46)

| Pattern ID | Meaning | Typical fix |
|------------|---------|-------------|
| `sample-json` | Quoted `*-sample.json` path | Centralize in seed registry |
| `web-data-sample` | Quoted `web/data/...` path | Use config-relative path + resolver |
| `mock-path` | Quoted `/mock/` segment | Move to fixtures dir + API |
| `template-sample` | Template literal with sample/mock | Same as above |

---

## Recommendations

### For ai-platform (now)

1. **Keep cascade allowlist** — 4 files only; review quarterly  
2. **Do not add `src/` to productionPaths** until stub API is refactored or allowlisted  
3. **Re-run after server changes:** `npm run simplebeacon:report`  
4. **Use fresh report** — ignore stale `.simplebeacon/test-report.json` (52 leaks)

### For customer assessments

1. Start with `standard` profile (`server/`, `src/`, `app/`, `lib/`)  
2. Triage hits into: **centralized loader (allowlist)** vs **real leak (fix)** vs **test-only (ignore via glob)**  
3. Fail gate on `high` only initially; tighten to `medium` after cleanup  

### When to fail gate on production leaks

| Stage | `gate.failOn` | Rationale |
|-------|---------------|-----------|
| Adoption | `high` | Fiction + credentials block; leaks warn |
| Hardened | `high,medium` | After allowlist + cleanup sprint |

---

## Commands

```bash
# Current cascade scan (0 leaks expected)
cd ai-platform && npm run simplebeacon:report

# Reproduce historical 52-leak snapshot context (server, no allowlist — for audit only)
node -e "require('./packages/simplebeacon-cli/src/rules/production-leak').scanProductionLeaks('.', {productionPaths:['server/'], severity:'medium', allowlistFiles:[]}).then(r=>console.log(r.findings))"

# Extended src/ scan (46 hits expected)
node -e "require('./packages/simplebeacon-cli/src/rules/production-leak').scanProductionLeaks('.', {productionPaths:['server/','src/'], severity:'medium', allowlistFiles:['server/lib/snapshot-seeds.js','server/lib/snapshot-resolver.js','server/lib/code-roadmap-generator.js','server/services/model-inference-service.js']}).then(r=>console.log(r.findings))"
```

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| Tier A allowlist | 4 files | Keep allowlisted |
| Tier B historical server leaks | 52 → **0** | No action — resolved |
| Tier C src/ stub layer | 46 if scanned | Exclude or allowlist by design |
| **Current gate** | **PASS** | Ship PR with confidence |
