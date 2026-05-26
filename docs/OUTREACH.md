# Free Simplebeacon Assessment — Outreach Script

Use this for Phase 1 customer discovery. **Do not oversell** — the scan covers sample JSON fiction, production-path leaks, credentials, and schema drift. It does not scan arbitrary AI hallucinations in source files.

---

## One-line pitch

> We run a CI gate that catches mock JSON in production code paths, fiction KPIs in sample files, and credential patterns — in under a minute. Want a free scan of your repo?

---

## Email / DM template

**Subject:** Free scan — mock data & fiction KPIs in [Company] repo?

Hi [Name],

Teams using Copilot/Cursor often end up with:

- `*-sample.json` or `/mock/` paths referenced from production code
- Inflated dashboard KPIs (`62% completion`, `47 features`) in committed JSON
- Demo credentials that look real

I built **Simplebeacon** — a CLI that scans for these in CI (`simplebeacon scan --gate`).

**Offer:** I'll run a free scan on your repo (read-only, no code changes) and send a short report:

1. Fiction KPIs in sample/mock JSON  
2. Production-path leaks (sample references in `server/` / `src/`)  
3. Credential pattern matches  
4. JSON schema drift vs your page specs  

Takes ~30 seconds. If it's useful, would you consider adding the gate to PRs?

[Your name]

---

## Call script (15 minutes)

### 1. Open (2 min)

- "What AI tools does your team use for code generation?"
- "Do you have dashboard JSON, fixtures, or mock data directories?"
- "Have you ever shipped demo metrics or sample paths by accident?"

### 2. Run scan live (5 min)

```bash
npx simplebeacon init --profile standard
npx simplebeacon scan --format text
npx simplebeacon scan --gate   # show what would fail CI
npx simplebeacon assess --company "[Company]" --assessor "[Your name]" --output assessments/[company].json
```

Walk through the report sections in order: **credentials → fiction KPIs → production leaks → schema**.

Send the assessment JSON (see [examples/outreach-tracker.md](./examples/outreach-tracker.md)).

### 3. Interpret results (5 min)

| Finding | What it means | Typical fix |
|---------|---------------|-------------|
| Fictional KPI | Sample JSON still has template metrics | Replace with measured baseline |
| Production Leak | Prod code references `-sample.json` | Route through API/scanner, centralize seeds |
| Credential Pattern | Possible secret in repo | Rotate + move to env vars |
| Schema Violation | Sample missing required page keys | Align with page spec |

### 4. Close (3 min)

- "Would blocking these on PR merge be worth $[X]/year to your team?"
- "Can I help you add `simplebeacon scan --gate` to GitHub Actions this week?" ([GITHUB-ACTION-QUICKSTART.md](./GITHUB-ACTION-QUICKSTART.md))
- If no: "What would you pay for instead?"

---

## Qualification checklist

**Good fit:**
- [ ] Uses AI coding assistants regularly
- [ ] Has `web/data`, `fixtures/`, or `mock/` directories
- [ ] Internal dashboards fed by JSON samples
- [ ] No dedicated AppSec tooling for mock/fiction drift

**Poor fit:**
- [ ] No sample/mock JSON in repo
- [ ] Expects full SAST/secret scanning replacement (position as complementary)
- [ ] Expects AI hallucination detection in all `.js` files (not shipped yet)

---

## Objection handling

**"We already use Snyk."**  
→ "Snyk finds CVEs. Simplebeacon finds mock paths and fiction KPIs in sample JSON — run both."

**"We don't commit sample data."**  
→ "Then production-leak and credential rules still apply; fiction KPI rule won't trigger."

**"Isn't this just linting?"**  
→ "It's domain-specific: known fiction patterns from real AI-assisted repos, plus hardcoded sample path detection."

---

## Success criteria (Phase 1)

- 10 assessments delivered  
- 3 teams add `simplebeacon scan --gate` to CI  
- 1 team commits to paid pilot ($2K+/year or equivalent)

See [examples/assessment-report-template.json](./examples/assessment-report-template.json) for the deliverable format and [examples/outreach-tracker.md](./examples/outreach-tracker.md) to track 10 assessments.

Generate assessments automatically:

```bash
npx simplebeacon scan --format json --output .simplebeacon/report.json --gate
npx simplebeacon assess --company "Acme Corp" --assessor "Your Name"
```

---

## Paid pre-launch audit — agency cold outreach ($499)

**Who to target:** Web/dev agencies shipping client apps; startup founders 2–4 weeks before launch; teams that use Copilot/Cursor and hand off repos to clients.

**What you sell:** One-time read-only repo audit + written deliverable (not a live proxy, not ongoing SaaS).

**Deliverable:** `simplebeacon scan --gate` + `simplebeacon assess` JSON/PDF-style summary: credential patterns, mock paths in production code, fiction KPIs in sample JSON, schema drift, gate pass/fail.

**Subject:** Pre-launch leak check for [Client/App name]?

Hi [Name],

I run **pre-launch code audits** for agencies and founders who use AI-assisted development.

Before you hand a repo to a client or go live, I scan for the mistakes that slip past review:

- API keys and token-shaped strings in source  
- Mock/sample JSON paths referenced from production code  
- Template KPIs and demo metrics still in committed data files  
- Sample JSON that doesn't match your page/API specs  

**How it works:** Read-only GitHub access (or a zip). I run the scan locally on my machine — your code never goes to a third-party cloud. You get a written assessment with severities and fix-first priorities within 48 hours.

**Flat fee: $499** · No subscription · No dashboard required

Sample deliverable: [SAMPLE_REPORT.md](./SAMPLE_REPORT.md) (redacted example — attach or link in email)

If you're shipping [Client project] in the next few weeks, I can slot one audit this week. Reply with the repo scope (or a staging branch) and I'll send a 2-line SOW.

[Your name]  
[Link to sample redacted report or GitHub]

---

**Follow-up (3 days, no reply):**

Hi [Name] — quick bump. One thing agencies miss before client handoff: `-sample.json` and `data/mock/` references left in `server/` or `src/`. Takes ~30 seconds to scan; fixing after launch is expensive. Still have one audit slot this week if useful.

---

**Scope line for invoice/SOW (copy-paste):**

> Read-only scan of one Git repository (default branch or named release branch). Deliverable: written assessment covering credential pattern matches, production-path mock/sample references, fiction KPI patterns in configured sample paths, JSON schema drift, and CI gate recommendation. Opinion-based audit — not a guarantee of security or legal compliance. Turnaround: 2 business days after access granted.

---

**Qualify before sending:**

- [ ] They ship code to external clients OR have a fixed launch date  
- [ ] Repo has `src/`, `server/`, or `app/` plus some fixtures/mock/data  
- [ ] They use AI coding tools (or junior devs) — not required but higher hit rate  
- [ ] Skip if they want live chat blocking, SOC 2 attestation, or 24/7 support SLA
