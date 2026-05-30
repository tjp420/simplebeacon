# Simplebeacon positioning (internal)

**Do not copy-paste forum scripts.** Write in your own voice. Link to the GitHub repo and Docker one-liner.

---

## What we are

Deterministic static analysis for **AI-assisted development risks**: fiction KPIs in sample JSON, mock paths wired into production code, credential patterns, schema drift.

**Not:** an LLM security platform, semantic code review, SOC 2 certified SaaS, or zero-false-positive magic.

**Domain note:** `simplebeacon.ai` is the marketing site and optional hosted dashboard. The product is the **local CLI** — code stays on the client's machine unless they explicitly opt into sanitized report upload.

---

## Approved one-liners

> Simplebeacon is a local Node CLI that regex-scans your repo for AI-placeholder data and production leaks. Runs in CI, Docker, or air-gapped — no source upload required.

> We catch the blind spot between Copilot/Cursor placeholders and your release gate — deterministic rules, tunable allowlists, honest false-positive tradeoffs.

---

## Do NOT claim

- "AI Safety platform" (use: **release hygiene for AI-assisted code**)
- Raw issue counts as a flex (4,000 hits on a public OSS repo = noisy rules, not quality)
- SOC 2 / ISO compliance without certification
- Zero false positives
- That scanning requires sending us your repo (default is **client-run CLI**)

---

## Primary delivery model (2026)

| Model | Who runs scan | Code location |
|-------|---------------|---------------|
| **CLI in client CI** (default) | Client | Client runner / Docker |
| **Docker on client VPC** | Client ops | Client infrastructure |
| **Consultant PDF** (optional) | Client runs CLI; shares JSON report only | Never required to send source |

Legacy ZIP-to-founder workflow is **deprecated** — do not lead with it in sales or site copy.

---

## Install commands (public)

```bash
npx --yes simplebeacon init --starter
npx --yes simplebeacon scan --gate --offline
```

```bash
docker build -f docker/Dockerfile.cli -t simplebeacon/cli .
docker run --rm -v "$(pwd):/repo:ro" -v "$(pwd)/.simplebeacon:/out" \
  simplebeacon/cli scan --path /repo --format json --output /out/report.json --offline
```

---

## Findings UI

Built with Next.js + TanStack Table + virtualization at `/findings/` — load local JSON; no upload.

Build: `npm run findings:build` from `ai-platform/`.
