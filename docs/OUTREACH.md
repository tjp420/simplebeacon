# Simplebeacon Pre-Launch Audit — Outreach (Path 1)

**Product:** $499 flat · read-only repo · written report in 48h · not SaaS, not live proxy.

**Public proof (use in every email):**

- CLI: https://github.com/tjp420/simplebeacon  
- Sample deliverable: https://github.com/tjp420/simplebeacon/blob/main/docs/SAMPLE_REPORT.md  

Do **not** link to `CascadeProjects` — that repo is private and 404s for prospects.

---

## One-line pitch

> I run a $499 pre-launch repo audit — credentials, mock paths in production code, and fiction KPIs in sample JSON — deliverable in 48 hours, read-only, no subscription.

---

## Paid audit email (copy-paste — send 5 today)

**Subject options (pick one):**

- Pre-launch leak check before [Client name] goes live?
- $499 repo audit — mock data & credential scan (48h)
- Quick question before you hand off [Project] to the client

**Body:**

Hi [First name],

I run **pre-launch code audits** for dev agencies and founders shipping AI-assisted code.

Before handoff or launch, I scan read-only for what review often misses:

- API keys and token-shaped strings in source  
- Mock/sample paths (`*-sample.json`, `data/mock/`) referenced from production code  
- Template KPIs and demo metrics still in committed JSON  
- Sample files that drift from your page/API specs  

**How it works:** GitHub read access or a zip. I run the scan locally — nothing goes to a third-party cloud. You get a written assessment with severities and fix-first priorities within **48 hours**.

**Flat fee: $499** · No subscription · No dashboard required

**Sample report (redacted):** https://github.com/tjp420/simplebeacon/blob/main/docs/SAMPLE_REPORT.md  
**Open-source scanner:** https://github.com/tjp420/simplebeacon  

If [Client project / their agency name] is shipping in the next few weeks, I have one audit slot this week. Reply with repo scope (branch name is fine) and I'll send a 2-line SOW.

[Trevor / Your name]  
[Your email]  
[Payment link or "Invoice on acceptance"]

---

**Follow-up (3 days, no reply):**

Subject: Re: pre-launch leak check

Hi [First name] — quick bump. The usual miss before client handoff: `-sample.json` and `data/mock/` still referenced from `server/` or `src/`. Scan takes minutes; fixing after launch is expensive. One slot left this week if useful.

[Trevor]

---

## SOW line (invoice / reply to "yes")

> Read-only scan of one Git repository (default branch or named release branch). Deliverable: written assessment covering credential pattern matches, production-path mock/sample references, fiction KPI patterns in configured sample paths, JSON schema drift, and CI gate recommendation. Opinion-based audit — not a guarantee of security or legal compliance. Turnaround: 2 business days after access granted. Fee: $499 USD, due on acceptance.

---

## Where to find 5 targets (30 min)

1. **Clutch.co** → filter Web Developers, 10–49 employees, US/UK  
2. Open **Portfolio** → pick agencies shipping dashboards / SaaS / client portals  
3. Contact: **Founder, CTO, or Technical Director** (not generic info@ unless that's all you have)  
4. Personalize one line: client industry or "saw you ship React/Node builds"

**Good fit:** ships client code, uses AI tools, has fixtures/mock/data folders.  
**Skip:** wants SOC 2 attestation, 24/7 SLA, or live chat DLP.

---

## When they say yes — run locally

```bash
cd /path/to/client-clone
npx simplebeacon init
npx simplebeacon scan --path . --format json --output .simplebeacon/report.json --gate
npx simplebeacon assess --company "Client Name" --assessor "Your Name"
npx simplebeacon compliance --format json --output .simplebeacon/compliance-result.json
```

Polish findings into the SAMPLE_REPORT format → PDF or markdown email attachment → invoice paid.

---

## Legacy: free discovery email (optional — use after paid path is moving)

**Subject:** Free scan — mock data & fiction KPIs in [Company] repo?

Hi [Name],

Teams using Copilot/Cursor often end up with `*-sample.json` in production imports, inflated KPIs in committed JSON, and demo credentials that look real.

I built **Simplebeacon** (https://github.com/tjp420/simplebeacon) — a CLI that catches these in CI (`simplebeacon scan --gate`).

**Offer:** I'll run a free read-only scan and send a short report. If it's useful, we can talk about a full pre-launch audit ($499) before your next client handoff.

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

## Objection handling
