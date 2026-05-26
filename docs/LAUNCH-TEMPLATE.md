# Launch templates — AI fake data detection

Use these when posting to Reddit, Hacker News, Dev.to, Indie Hackers, or AI tool communities.

Replace `[repo-url]` with your public GitHub or npm link before posting.

---

## Reddit / Dev.to (problem-first)

**Title:** Tired of AI assistants generating fake data that slips into production?

**Body:**

I built an open-source CLI that catches AI-generated mock data, dummy URLs, and fake metrics in your CI pipeline before they ship.

**Repo:** [repo-url]

**The problem:** GitHub Copilot and Cursor often generate placeholder data that developers forget to replace — inflated KPIs, `api.example.com` URLs, `-sample.json` paths wired into production code. It looks fine in review and breaks in prod.

**What Simplebeacon catches:**

- Hardcoded fiction KPIs (`completion_rate: 98.5`, `user_count: 47`)
- Mock/sample paths referenced from production code
- Demo credentials and token-like strings
- Sample JSON that drifts from your baseline

**Setup (~30 seconds):**

```bash
npx simplebeacon init
npx simplebeacon scan --gate
```

Add `.github/workflows/simplebeacon.yml` from the repo examples — fails the job when high-severity issues are found. Local-only by default; no telemetry.

Has anyone else hit this? How are you catching AI placeholders today?

---

## Hacker News (Show HN)

**Title:** Show HN: Simplebeacon – CI gate for AI-generated fake metrics and mock data in prod code

**Body:**

Simplebeacon is a local-first CLI that scans repos for fiction KPIs, mock data paths in production code, and credential patterns, then fails CI when `--gate` finds blocking issues.

Built after one too many `-sample.json` references and `98.5% completion` metrics making it past review when Copilot/Cursor filled in placeholders.

- `npx simplebeacon init && npx simplebeacon scan --gate`
- GitHub Action example in repo
- MIT, zero runtime deps, offline mode available

[repo-url]

Looking for feedback on detection rules and false-positive tuning.

---

## Short tweet / Discord

AI keeps shipping fake KPIs and mock JSON paths into our repos. I open-sourced a CI gate for it: fiction metrics, prod→mock leaks, credential patterns. `npx simplebeacon scan --gate` — [repo-url]

---

## Target communities

| Channel | Notes |
|---------|--------|
| r/webdev, r/javascript, r/programming | Lead with the problem, not the product name |
| Hacker News Show HN | Technical, ask for feedback on rules |
| Dev.to | Include GitHub Action snippet |
| Indie Hackers | Emphasize zero-cost community tier |
| Cursor / Copilot forums | Mention specific failure modes (sample paths, fake %) |

---

## Pre-post checklist

- [ ] Repo is public with focused README
- [ ] `examples/github-action/simplebeacon.yml` committed
- [ ] Run `npx simplebeacon scan --gate` locally on a clean branch (exit 0)
- [ ] Have one screenshot or JSON report snippet ready if asked
- [ ] Reply plan for "how is this different from Snyk/Semgrep?" → complementary: fiction KPIs + mock paths, not CVEs

See also [OUTREACH.md](./OUTREACH.md) for assessment and customer deliverable workflow.
