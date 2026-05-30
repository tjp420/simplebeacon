# Getting started (one path)

Local deterministic gate for AI-assisted code. **No repo upload. No SaaS required.**

## 1. Install + wire MCP + CI (one command)

```bash
npx --yes simplebeacon init --starter
```

**Teams (reproducible):**

```bash
npm install -D simplebeacon
npx simplebeacon init --starter
```

Creates:

| Path | Purpose |
|------|---------|
| `.simplebeacon/config.json` | Rules + allowlists |
| `.simplebeacon/baseline.json` | Fiction KPI baseline |
| `.cursor/mcp.json` | Cursor MCP (`simplebeacon-mcp --offline`) |
| `.cursor/rules/simplebeacon-scan-workflow.mdc` | Agent scan workflow |
| `.github/workflows/simplebeacon.yml` | PR/push gate (authoritative) |

Reload Cursor → **Settings → MCP** → enable **simplebeacon**.

## 2. Daily workflow

| When | Action |
|------|--------|
| **While coding** | MCP `scan_snippet` / `scan_file` |
| **Before commit** | `npx simplebeacon hook install` (optional) |
| **Before PR** | `npx simplebeacon scan --gate --offline` + `gate status` |

## 3. Verify

```bash
npx simplebeacon-mcp --smoke-test
npx simplebeacon scan --gate --offline
npx simplebeacon gate status
```

See [MCP-USER-SETUP.md](./MCP-USER-SETUP.md) · [GATE-CALIBRATION.md](./GATE-CALIBRATION.md) · [TRUST.md](./TRUST.md)

## What we do not sell

- Raw finding counts as quality proof  
- Required repo upload for $499  
- Hosted MCP that reads your source on our servers  

Gate **blocking issues** + tuned allowlists = the metric that matters.

Install guide: [simplebeacon.ai/community](https://simplebeacon.ai/community)
