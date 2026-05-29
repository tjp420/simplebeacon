# Simplebeacon

**Stop AI-generated fake data from slipping into production.**

[![npm](https://img.shields.io/badge/npm-not%20published%20yet-lightgrey)](https://www.npmjs.com/package/simplebeacon)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub](https://img.shields.io/github/stars/tjp420/simplebeacon?style=social)](https://github.com/tjp420/simplebeacon)

GitHub Copilot, Cursor, and other AI assistants often generate placeholder data that looks real. Simplebeacon scans your codebase and **fails CI** when mock metrics, dummy URLs, or demo credentials try to ship.

**Community ($0):** unlimited local scans · JSON + text reports · gate policy (`--gate`) · GitHub Actions + pre-commit hooks · zero runtime dependencies · local-only by default.

Hosted dashboard and cloud sync: [simplebeacon.ai](https://simplebeacon.ai) (Cloud Teams / Enterprise).

## The problem

AI-assisted edits frequently leave behind:

| What slips in | Example | What breaks |
|---------------|---------|-------------|
| Fake metrics | `completion_rate: 98.5`, `user_count: 47` | Dashboards and reports show fiction |
| Dummy URLs | `https://api.example.com/v1` | Production calls hit placeholders |
| Mock paths in prod code | `web/data/status-sample.json` | App loads demo data at runtime |
| Demo credentials | `sk-...`, `AKIA...` in source | Security incidents, failed audits |

Developers mean to replace these before merge. Simplebeacon catches what code review misses.

## The solution

Simplebeacon scans source and sample data, then gates on:

- **Fiction KPIs** — hardcoded metrics that don't match your baseline
- **Production leaks** — mock/sample paths referenced from production code
- **Credential patterns** — tokens and keys that look real
- **Schema drift** — sample JSON that violates your page specs

```bash
# Until npm publish: install from GitHub
npx --yes github:tjp420/simplebeacon init
npx --yes github:tjp420/simplebeacon scan --gate

# After npm publish (coming soon):
# npx simplebeacon init
# npx simplebeacon scan --gate
```

Exit code `1` when blocking severities are found — wire it into CI and pre-commit hooks.

## 30-second setup

```bash
npx --yes github:tjp420/simplebeacon init                  # creates .simplebeacon/config.json
npx --yes github:tjp420/simplebeacon scan --gate           # scan + fail on high-severity issues
npx --yes github:tjp420/simplebeacon hook install          # optional: block bad commits locally
```

For credentials + production-leak only: `npx simplebeacon init --profile minimal`

## GitHub Actions

Copy [examples/github-action/simplebeacon.yml](examples/github-action/simplebeacon.yml) to `.github/workflows/simplebeacon.yml`:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: '20'
- run: npx --yes simplebeacon scan --gate --format json --output .simplebeacon/report.json
```

Full workflow with PR summary, artifacts, and gate options: [docs/GITHUB-ACTION-QUICKSTART.md](docs/GITHUB-ACTION-QUICKSTART.md)

Forum launch copy: [docs/LAUNCH-TEMPLATE.md](docs/LAUNCH-TEMPLATE.md)

**Anti-bloat manifesto:** [docs/ANTI-BLOAT-MANIFESTO.md](docs/ANTI-BLOAT-MANIFESTO.md) · [Benchmarks](docs/BENCHMARKS.md)

---

## Why Simplebeacon

AI-assisted development produces repos full of:

- Inflated KPIs (`74.17% completion`, `47 features`)
- Hardcoded `-sample.json` paths in production code
- Demo credentials that look real
- Mock data shipped as if it were measured

Simplebeacon scans your codebase and **fails CI** when fiction tries to ship.

## Security & Privacy Guarantees

- **Zero code mutation**: Simplebeacon never modifies your source files (read-only scans; verified in tests)
- **Local-only by default**: No data leaves your machine unless you explicitly pass `--upload`
- **Offline mode**: `simplebeacon scan --offline` fails if any outbound network activity is detected
- **Credential redaction**: Detected secrets are masked in JSON reports before they are written or uploaded
- **Open source**: Fully auditable MIT-licensed code
- **No telemetry**: The community CLI does not phone home or collect usage data

See [docs/TRUST.md](docs/TRUST.md) for architecture, data flow, and verification steps.

## Safety Features

- **Atomic writes**: setup and report files use temp-file + rename
- **Automatic backups**: existing config/hook/baseline files are backed up before overwrite
- **Write validation**: JSON and hook outputs are validated after write
- **Rollback**: multi-step setup operations restore backups on failure
- **Dry-run mode**: preview `init` and `hook install` with `--dry-run`

## Install

```bash
npm install -D simplebeacon
# or zero-install
npx simplebeacon init
npx simplebeacon hook install
```

## Quick start

```bash
npx simplebeacon init                  # auto-detects project layout
npx simplebeacon init --dry-run        # preview init without writing files
npx simplebeacon scan                  # scan and report (text)
npx simplebeacon scan --offline        # fail if any network activity occurs
npx simplebeacon scan --gate           # exit 1 on blocking issues
npx simplebeacon scan --format json --output .simplebeacon/report.json
npx simplebeacon hook install          # pre-commit gate
npx simplebeacon baseline sync         # sync Jest counts after green tests
```

### Profiles

```bash
npx simplebeacon init --profile minimal    # credentials + production-leak only
npx simplebeacon init --profile standard   # all rules, generic defaults
npx simplebeacon init --profile cascade    # ai-platform dashboard preset
```

## Commands

| Command | Description |
|---------|-------------|
| `simplebeacon init` | Create `.simplebeacon/config.json` and `baseline.json` |
| `simplebeacon scan` | Scan project; `--gate` exits 1 on blocking issues |
| `simplebeacon baseline sync` | Run Jest and write pass counts to baseline |
| `simplebeacon comment` | Post PR comment from JSON report |
| `simplebeacon assess` | Build customer assessment JSON from scan report |
| `simplebeacon report` | Build client-facing markdown audit (`AUDIT_REPORT.md`) |
| `simplebeacon compliance` | Evaluate corporate safety checklist from scan report |
| `simplebeacon hook install` | Write pre-commit or pre-push hook (Husky or `.git/hooks`) |

### Scan flags

| Flag | Description |
|------|-------------|
| `--path <dir>` | Project root (default: cwd) |
| `--config <file>` | Config path |
| `--format text\|json` | Output format |
| `--output <file>` | Write report to file |
| `--gate` | Fail when severities in `gate.failOn` are found |
| `--fail-on high,medium` | Override gate severities |
| `--with-jest` | Run tests and compare to baseline |
| `--verbose` | Show config warnings and scan paths |
| `--offline` | Fail if any outbound network activity occurs during the scan |
| `--no-trust-banner` | Suppress read-only / local-only confirmation lines |
| `--dry-run` | Preview `init` / `hook install` without writing files |
| `--force` | Overwrite existing init files (backup created first) |
| `--profile` | Force init profile |

## Rules

| Rule | Severity | Detects |
|------|----------|---------|
| `credentials` | high/medium | AWS keys, JWT, GitHub PATs, OpenAI keys, private keys |
| `json-schema` | high | Sample JSON violating page specs |
| `sample-consistency` | high | Cross-file KPI drift vs baseline |
| `roadmap` | medium | Legacy fiction roadmaps, oversized exports |
| `production-leak` | high/medium | Mock/sample paths in production code |
| `jest-baseline` | high | Jest pass count drift (optional, `--with-jest`) |

See [docs/RULES.md](docs/RULES.md) and [docs/CONFIG.md](docs/CONFIG.md).

**Go-to-market:** [docs/OUTREACH.md](docs/OUTREACH.md) · [Assessment report template](docs/examples/assessment-report-template.json) · [Production leak triage](docs/PRODUCTION-LEAK-TRIAGE.md)

## Complementary stack

```text
Snyk / GHAS     → known CVEs
SonarQube       → code smells, coverage
Simplebeacon    → fiction KPIs in sample JSON, mock paths in prod code, credential patterns
```

Run Simplebeacon in the same CI job as your existing security tools — it gates on different artifacts.

## GitHub Actions

Copy [examples/github-action/simplebeacon.yml](examples/github-action/simplebeacon.yml) to `.github/workflows/simplebeacon.yml`, or use the snippet below.

### Standalone repo

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
- run: npx simplebeacon init --profile minimal
- run: npx simplebeacon scan --gate --format json --output .simplebeacon/report.json
```

### Composite action

```yaml
- uses: ./ai-platform/action
  with:
    path: .
    fail-on: high
    post-comment: true
```

See [docs/GITHUB-ACTION-QUICKSTART.md](docs/GITHUB-ACTION-QUICKSTART.md), [docs/PRE-COMMIT.md](docs/PRE-COMMIT.md), and [docs/CI.md](docs/CI.md).

## Starter template

Copy [examples/starter/.simplebeacon/](examples/starter/.simplebeacon/) into your repo for a minimal working config.

## Documentation

- [Configuration](docs/CONFIG.md)
- [Trust & privacy](docs/TRUST.md)
- [Pre-commit hooks](docs/PRE-COMMIT.md)
- [CI Integration](docs/CI.md)
- [Rules reference](docs/RULES.md)
- [Marketing claims (verified)](docs/MARKETING.md)
- [Naming & branding research](docs/NAMING.md)

## Publish

```bash
cd packages/simplebeacon-cli
npm test
npm publish --access public
```

## Development

```bash
cd packages/simplebeacon-cli
npm test
node bin/simplebeacon.js scan --path ../.. --gate
```

## License

MIT
