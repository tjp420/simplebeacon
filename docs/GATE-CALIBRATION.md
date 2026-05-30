# Gate calibration — honest metrics

Simplebeacon is **strict by default**. Large repos produce many **informational** pattern hits; the **gate** only fails on configured severities (default: `high`).

## What to measure (and what not to)

| Metric | Use for marketing? | Use for engineering? |
|--------|-------------------|----------------------|
| **Raw findings** (thousands on OSS repos) | **No** — reads as noise | Triage + allowlist tuning only |
| **Gate blocking count** | **Yes** — sparingly | CI pass/fail |
| **MCP `blockingCount` on snippets** | Yes — shift-left demos | Pre-accept edit checks |
| **False positives after allowlist** | Yes — with fixture repos | Week-1 onboarding |

Do not benchmark Simplebeacon by scanning random public monorepos and posting the total. That invites exactly the “4000 AI” critique.

## Fixture-based evaluation

Run on **controlled snippets** (see `tests/mcp.test.js`, `tests/rules.test.js`):

| Input | Expected |
|-------|----------|
| `import x from '../web/data/status-sample.json'` | **Blocking** production-leak |
| `const key = "AKIA…"` | **Blocking** credential pattern |
| `YOUR_API_KEY_HERE` in source | **Blocking** LLM slop (SB-FICTION-001) |
| Clean production import from API module | **No blocking** |

Reproduce MCP path:

```bash
npm run scan:snippet -- "import x from '../web/data/status-sample.json';"
```

## Full-repo gate (this monorepo)

```bash
npx simplebeacon scan --gate --offline --format json --output .simplebeacon/report.json
npx simplebeacon gate status
```

Report **gate pass/fail** and **blocking count** — not total `issueCount` or analyzer findings totals.

## Tuning false positives

1. Run gate once; collect blocking issues.  
2. Confirm each is real or test/fixture context.  
3. Add path/pattern allowlists in `.simplebeacon/config.json`.  
4. Re-run until gate reflects **release risk**, not inventory noise.  

See [CONFIG.md](./CONFIG.md) and [PRODUCTION-LEAK-TRIAGE.md](./PRODUCTION-LEAK-TRIAGE.md).

## Comparing tools (e.g. competitor scans)

Offer **methodology comparison** on the same fixture set:

- Precision on known-bad snippets  
- False positives on known-good production files  
- Local execution + offline proof  

Not stack wars (Rust vs Node) or raw totals on unrelated repos.

## Performance

See [BENCHMARKS.md](./BENCHMARKS.md) for scan latency — separate from calibration quality.
