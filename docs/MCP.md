# Simplebeacon MCP Server

Local **Model Context Protocol** integration for Cursor, Claude Desktop, and other MCP clients. Scans run on your machine — **no source upload**.

## Tools

| Tool | Purpose |
|------|---------|
| `scan_snippet` | Scan pasted/generated code for fiction KPIs, mock paths, credentials, LLM slop |
| `scan_file` | Scan one file within the project root |
| `gate_status` | Read `.simplebeacon/report.json` gate pass/fail + top blocking issues |
| `explain_finding` | Deterministic rule metadata for a pattern ID (not LLM inference) |

## Quick start (Cursor)

**Users (any repo):**

```bash
npm install -D simplebeacon
npx simplebeacon init --with-mcp
```

Reload Cursor → enable **simplebeacon** in MCP settings. Full guide: [MCP-USER-SETUP.md](./MCP-USER-SETUP.md).

**Manual config** — copy [examples/mcp/cursor.mcp.json](../examples/mcp/cursor.mcp.json) to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "simplebeacon": {
      "command": "node",
      "args": ["packages/simplebeacon-cli/bin/simplebeacon-mcp.js", "--offline"],
      "env": {
        "SIMPLEBEACON_PROJECT_ROOT": "/absolute/path/to/your/repo",
        "SIMPLEBEACON_OFFLINE": "1"
      }
    }
  }
}
```

From monorepo root:

```bash
node packages/simplebeacon-cli/bin/simplebeacon-mcp.js --offline
```

**Terminal looks frozen?** That is normal. Stdio MCP servers wait for JSON-RPC from Cursor — they do not print a prompt. To verify locally:

```bash
npm run test:mcp          # smoke test + integration tests (from ai-platform/)
node packages/simplebeacon-cli/bin/simplebeacon-mcp.js --smoke-test
```

Do **not** run `simplebeacon:mcp` manually unless debugging — let Cursor launch it via `.cursor/mcp.json`.

## Workflow during development

Three phases — **local only**, no source upload:

| Phase | When | Action |
|-------|------|--------|
| **1. While coding** | Before accepting AI-generated edits | MCP **`scan_snippet`** (`content` + virtual `filePath`) |
| **2. On save** | After editing a file | MCP **`scan_file`** (relative path) |
| **3. Before PR** | Pre-merge / CI | `npm run simplebeacon:pre-pr` or `scan --gate --offline` + **`gate status`** / MCP **`gate_status`** |

Cursor: enable MCP via [`.cursor/mcp.json`](../../.cursor/mcp.json) (project root). Agent behavior: [`.cursor/rules/simplebeacon-scan-workflow.mdc`](../../.cursor/rules/simplebeacon-scan-workflow.mdc).

MCP gives **fast feedback on snippets**; the CLI **`--gate`** remains the **source of truth** for cross-file consistency and CI.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `SIMPLEBEACON_PROJECT_ROOT` | `process.cwd()` | Repo root for baseline + report paths |
| `SIMPLEBEACON_OFFLINE` | off | Set `1` to fail if any outbound network occurs |

## Architecture

```
MCP client (Cursor)
  → stdio JSON-RPC
  → simplebeacon-mcp.js
  → snippet-scanner.js
  → existing rules (credentials, production-leak, fiction-kpi, llm-slop)
```

Zero additional npm dependencies — same engines as `simplebeacon scan` and `simplebeacon-proxy`.

## Honest limits

- Snippet scan does **not** replace a full repo walk (no cross-file consistency, no jest baseline)  
- Regex rules produce false positives — tune `.simplebeacon/config.json`  
- Not SOC2, not semantic AI review  

See [TRUST.md](./TRUST.md) for privacy guarantees.
