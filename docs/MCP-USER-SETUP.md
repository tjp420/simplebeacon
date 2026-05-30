# Enable MCP for your users

Simplebeacon MCP is **free, local, and not hosted on simplebeacon.ai**. Each user runs `simplebeacon-mcp` on their machine; Cursor (or Claude Desktop) connects over stdio.

## Requirements

| Requirement | Notes |
|-------------|--------|
| **Node.js ≥ 16** | Same as CLI |
| **MCP client** | Cursor, Claude Desktop, or any stdio MCP host |
| **Simplebeacon installed** | devDependency, `npx`, or monorepo path |
| **No SaaS account** | No API key for community MCP |

---

## Fastest path (recommended)

From the user's project root — one command:

```bash
npx --yes simplebeacon init --starter
```

`--starter` = config + `.cursor/mcp.json` + agent rule + GitHub Action workflow.

Or step-by-step:

```bash
npm install -D simplebeacon
npx simplebeacon init --starter
```

Or MCP only:

```bash
npx simplebeacon init --with-mcp
```

This creates:

- `.simplebeacon/config.json` — scan rules + allowlists  
- `.cursor/mcp.json` — Cursor MCP wiring (`npx simplebeacon-mcp --offline`)

Then:

1. Open the project in **Cursor**  
2. **Settings → MCP** → enable **simplebeacon**  
3. **Reload window**  
4. Ask the agent to use `scan_snippet` before accepting AI-generated edits  

Verify:

```bash
npx simplebeacon-mcp --smoke-test
```

---

## Install options

### A. devDependency (teams, reproducible)

```bash
npm install -D simplebeacon
```

Use `examples/mcp/cursor.mcp.json` — runs `npx simplebeacon-mcp --offline`.

### B. Zero install (solo dev, npx cache)

```bash
npx --yes simplebeacon init --starter
```

Or copy `examples/mcp/cursor.npx-github.mcp.json` for zero-install MCP (no `npm install` required):

```json
{
  "mcpServers": {
    "simplebeacon": {
      "command": "npx",
      "args": ["--yes", "simplebeacon-mcp", "--offline"],
      "env": {
        "SIMPLEBEACON_PROJECT_ROOT": "${workspaceFolder}",
        "SIMPLEBEACON_OFFLINE": "1"
      }
    }
  }
}
```

First MCP call may download the package; scans still run locally.

### C. npm publish (when live)

After `simplebeacon` is on npm:

```bash
npm install -D simplebeacon
npx simplebeacon init --with-mcp
```

Same config — `npx simplebeacon-mcp`.

### D. Monorepo contributors (ai-platform)

Use `examples/mcp/cursor.monorepo.mcp.json` or keep the repo's `.cursor/mcp.json`.

### E. Claude Desktop

Merge `buildClaudeDesktopMcpJson()` output into Claude's MCP config (same shape as Cursor). Set `SIMPLEBEACON_PROJECT_ROOT` to the project path on disk.

---

## What users get (four tools)

| Tool | Use |
|------|-----|
| `scan_snippet` | Check AI-generated code before applying |
| `scan_file` | Check a saved file |
| `gate_status` | Read last full scan gate from `.simplebeacon/report.json` |
| `explain_finding` | Rule metadata for a pattern id |

Full repo gate before PR: `npx simplebeacon scan --gate --offline` (not MCP-only).

---

## Enterprise / air-gapped

| Constraint | Approach |
|------------|----------|
| No GitHub/npm egress | Vendor the `simplebeacon` package into internal registry; point MCP `command` at internal `node …/simplebeacon-mcp.js` |
| Offline proof | Always pass `--offline` and set `SIMPLEBEACON_OFFLINE=1` |
| No Cursor | Use CLI only: `tools/mcp-scan-snippet.js`, hooks, GitHub Action |

See [simplebeacon-on-premises-deployment.md](../../../docs/simplebeacon-on-premises-deployment.md).

---

## What you should **not** sell as MCP

- Hosted MCP on simplebeacon.ai (not built — would contradict local-first story unless explicitly on-prem)  
- MCP as substitute for SOC2 / zero-FP claims  
- Requiring repo upload to enable MCP  

MCP access = **install CLI + drop config**. That's the product.

---

## Publish checklist (for maintainers)

1. [ ] Publish `simplebeacon` to npm (includes `simplebeacon-mcp` bin)  
2. [ ] Document `npx simplebeacon init --with-mcp` on simplebeacon.ai/community  
3. [ ] Add MCP smoke test to CI: `npm run test:mcp`  
4. [ ] Optional: Cursor extension marketplace listing pointing at this config  

See [MCP.md](./MCP.md) for protocol details.
