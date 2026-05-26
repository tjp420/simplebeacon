# Why I Built a Zero-Dependency Local Scanner Instead of Buying AI Guardrail Bloat

**Simplebeacon — local CI gate for AI-generated fake data, mock paths, and credential patterns**

This is a technical manifesto, not a pitch deck. Numbers below were measured on this machine (Windows 10, Node 20) against the `ai-platform` monorepo unless noted.

---

## 1. The problem: guardrail bloat

AI coding assistants leave realistic-looking placeholders in repos:

- Fiction KPIs (`completion_rate: 98.5`, `user_count: 47`)
- Mock JSON paths wired into production code (`status-sample.json`)
- Token-shaped strings that pass review

The industry response is often **heavy**: SaaS APIs, agent proxies, vendor dashboards, and pricing that starts at team tiers and climbs to **$5,000+ setup** for perimeter deployments.

That stack is justified when you need centralized policy, SSO, and managed DLP. It is **overkill** when your immediate need is: *fail CI if Copilot left fake data in the PR.*

---

## 2. The data: local scans vs. cloud-shaped workflows

### Measured on Simplebeacon (May 2026)

| Workload | Time | Notes |
|----------|------|--------|
| Credential pattern scan (~7 KB README-sized text) | **~0.022 ms** / call | `scanTextContent`, 500-iteration median |
| Privacy pattern scan (same size) | **~0.14 ms** / call | `scanEnterprisePatterns` |
| Full repo gate scan (`ai-platform/`, `--gate`) | **~4.0 s** | Includes file walk, rules, production-leak pass |
| npm install surface | **0 runtime dependencies** | `package.json` has no `dependencies` |

Reproduce:

```bash
cd packages/simplebeacon-cli && npm test
cd ../.. && node packages/simplebeacon-cli/bin/simplebeacon.js scan --path . --gate --no-trust-banner
```

### Cloud-shaped alternative (order-of-magnitude, not a vendor benchmark)

Sending every prompt or file chunk to a remote guardrail typically adds:

- **Network RTT:** 50–200+ ms per request (region-dependent)
- **Vendor processing:** often quoted in hundreds of ms for policy evaluation
- **Egress + retention policy debates:** weeks of procurement

For **pre-merge repo scanning**, the work is embarrassingly parallel and read-only. Running regex + path rules locally avoids per-request billing and keeps code on your machine.

**Honest caveat:** Simplebeacon is not a replacement for enterprise DLP, SOC2 logging, or TLS MITM proxies. It is a **fast local gate** on a specific failure mode: AI fiction and mock data shipping to production.

---

## 3. The solution: zero-dependency architecture

Design constraints:

1. **No runtime npm dependencies** — auditable, install via `npx`, no supply-chain tree
2. **Read-only scans** — never mutates source (verified in tests)
3. **Offline by default** — `--offline` fails if any network call occurs
4. **Explicit gate** — `--gate` exits 1 on configured severities for CI

```
CLI (simplebeacon.js)
  → config + path safety (PathSanitizer, typed errors)
  → scan (walk files, apply rules)
  → reporters (text / JSON)
  → optional GitHub Action (workflow in examples/)
```

Rules are plain Node modules — no AST vendor lock-in for the community tier:

| Module | What it catches |
|--------|-----------------|
| `fiction-kpi-patterns.js` | Hardcoded metrics vs baseline |
| `production-leak.js` | Mock/sample paths in prod code |
| `credential-pattern-scanner.js` | AWS keys, JWTs, OpenAI keys, etc. |
| `mock-data-schema-validator.js` | Sample JSON vs page specs |

---

## 4. The code: what actually runs

### Credential scan (excerpt)

Pattern loop with allowlist for documented placeholders — no ML, no network:

```javascript
for (const pattern of CREDENTIAL_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
        if (isAllowlisted(match, content, fileName)) continue;
        findings.push({ pattern: pattern.id, severityBand, ... });
    }
}
```

See: `packages/simplebeacon-cli/src/lib/credential-pattern-scanner.js`

### Production leak (concept)

Flags production code that references `-sample.json`, `data/mock`, template literals pointing at fixture paths — the failure mode AI tools create constantly.

See: `packages/simplebeacon-cli/src/rules/production-leak.js`

### Path safety (security)

Relative config paths cannot escape the project root; prefix-safe containment blocks `/repo` vs `/repo-evil` bypass:

```javascript
return child === root || child.startsWith(`${root}/`);
```

See: `packages/simplebeacon-cli/src/lib/path-utils.js`, `path-sanitizer.js`

---

## 5. The results

| Claim | Evidence |
|-------|----------|
| Catches AI fake data patterns | `tests/fiction.test.js`, `tests/rules.test.js`, `tests/github-action.test.js` |
| CI gate works | Simulated clean pass + mock-path fail in GitHub Action tests |
| Zero runtime deps | `packages/simplebeacon-cli/package.json` |
| Local-only trust | `docs/TRUST.md`, `--offline` mode |

**Cost comparison (illustrative):**

| Approach | Marginal cost per scan | Data leaves laptop? |
|----------|------------------------|---------------------|
| Simplebeacon community | $0 | No (default) |
| Cloud Teams tier (this repo's dashboard) | $49/mo | If you opt in |
| Enterprise perimeter consulting | $5,000+ setup | Engagement-dependent |

The community CLI is the **Robin Hood layer**: the same detection ideas, no invoice required.

---

## 6. Call to action

```bash
npx simplebeacon init
npx simplebeacon scan --gate
```

GitHub Actions: copy `packages/simplebeacon-cli/examples/github-action/simplebeacon.yml`

Forum launch copy: `docs/LAUNCH-TEMPLATE.md`

---

## What I'd do differently in v2 (intellectual honesty)

- Full-tree codebase analyzer scans can take minutes on large monorepos — optimize or scope paths
- Regex rules produce false positives; profiles and allowlists exist for a reason
- Business tier on simplebeacon.ai is optional; the CLI stands alone

---

## License

MIT — use it, fork it, cite it in interviews.

**Author note:** Built as engineering portfolio + public utility, not as a forced upsell funnel.
