# Trust, Privacy, and Safety

Simplebeacon is designed for teams that need to scan production codebases without exposing intellectual property.

## Guarantees (community CLI)

| Guarantee | How it works |
|-----------|----------------|
| **Read-only scans** | The CLI only reads configured paths. It writes reports to paths you choose (for example `.simplebeacon/report.json`) and optional `.simplebeacon/` config — never back into scanned source trees. |
| **Local-only default** | Scans run entirely on your machine. No cloud upload unless you pass `--upload` and `--api-token`. |
| **Offline verification** | `simplebeacon scan --offline` monitors `http`, `https`, and `fetch` calls and exits with an error if any outbound network activity occurs. |
| **Credential redaction** | JSON reports are sanitized before write/upload. Secret-like substrings are replaced with masked tokens (for example `sk-████████████████████`). |
| **No telemetry** | The open-source CLI does not collect usage analytics or exfiltrate repository content. |
| **Your data stays yours** | Simplebeacon does not train models on your code, derive shared rules from your codebase, or retain scan content on Simplebeacon servers unless you opt into paid cloud upload. |

## Data flow

```text
Your repo (read-only)
    ↓
Configured scanPaths + productionPaths
    ↓
Pattern rules (credentials, fiction KPI, production leak, schema drift, …)
    ↓
Local report (.simplebeacon/report.json) — sanitized
    ↓
Optional: --upload (paid tier, explicit opt-in, further stripped for cloud)
```

## What Simplebeacon writes

| Path | Purpose |
|------|---------|
| `.simplebeacon/config.json` | Scan paths, rules, gate policy (created by `init`) |
| `.simplebeacon/baseline.json` | Jest baseline counts (created by `init` / `baseline sync`) |
| `--output` report file | Scan findings you requested |
| Git hooks (optional) | `hook install` writes a hook script only |

## Verification commands

```bash
# Standard local scan with trust confirmation (stderr)
npx simplebeacon scan

# Air-gapped / zero-network proof
npx simplebeacon scan --offline --gate

# Confirm JSON reports redact secrets
npm test -- tests/trust-guard.test.js tests/report-sanitizer.test.js
```

Integration tests in the parent `ai-platform` repo also prove **zero-mutation** behavior: scanned source files are byte-identical after a gate scan.

## Cloud upload (opt-in only)

Paid tier cloud sync requires both `--upload <url>` and `--api-token`. Reports are sanitized again before transmission (`stripRawIssues`). Use `--offline` to prove a scan path never touches the network.

## Setup safeguards

Destructive setup commands (`init`, `hook install`, `baseline sync`, report writes) use managed writes:

| Safeguard | Behavior |
|-----------|----------|
| Atomic write | Temp file in target directory, then rename |
| Backup | `.simplebeacon-backup.<timestamp>` beside overwritten files |
| Validation | JSON/hook shape checked immediately after write |
| Rollback | Failed multi-file operations restore backups |
| Dry-run | `--dry-run` on `init` and `hook install` previews actions only |

## Enterprise / legal

For production adoption, pair this document with:

- Your organization's security questionnaire responses
- Terms confirming customer retention of all IP
- Optional third-party security audit of the CLI package

SOC 2, GDPR DPA, and signed release artifacts are Phase 2–3 items on the trust roadmap — not yet published as certified compliance packages.
