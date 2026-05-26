# Outreach Tracker — Phase 1 (10 assessments)

Copy this table into Notion, a spreadsheet, or your CRM. Goal: **10 delivered**, **3 CI adoptions**, **1 paid pilot**.

| # | Company / contact | Repo URL | Status | Scan date | Gate | High | Medium | Assessment file | CI wired? | Next step |
|---|-------------------|----------|--------|-----------|------|------|--------|-----------------|-----------|-----------|
| 1 | | | queued | | | | | | no | Send OUTREACH email |
| 2 | | | queued | | | | | | no | |
| 3 | | | queued | | | | | | no | |
| 4 | | | queued | | | | | | no | |
| 5 | | | queued | | | | | | no | |
| 6 | | | queued | | | | | | no | |
| 7 | | | queued | | | | | | no | |
| 8 | | | queued | | | | | | no | |
| 9 | | | queued | | | | | | no | |
| 10 | | | queued | | | | | | no | |

**Status values:** `queued` → `contacted` → `scan scheduled` → `delivered` → `ci trial` → `pilot` → `closed-won` / `closed-lost`

---

## Per-assessment commands

Replace paths and names, run from the **customer repo root** (or clone into `assessments/<name>/`):

```bash
npx simplebeacon init --profile standard
npx simplebeacon scan --format json --output .simplebeacon/report.json --gate --verbose
npx simplebeacon assess \
  --company "Company Name" \
  --assessor "Your Name" \
  --output assessments/company-name.json
```

From **ai-platform** monorepo (local dev):

```bash
npm run simplebeacon:report
npm run simplebeacon:assess -- --company "Internal demo" --assessor "Trevor"
```

---

## Deliverable checklist

- [ ] Assessment JSON attached (`simplebeacon-assessment-report`)
- [ ] 1-page summary: gate PASS/FAIL + top 3 findings
- [ ] Offer: wire GitHub Action this week ([GITHUB-ACTION-QUICKSTART.md](../GITHUB-ACTION-QUICKSTART.md))
- [ ] Position vs Snyk: complementary, not replacement
- [ ] Log outcome in table above

---

## Email follow-up (after delivery)

**Subject:** Simplebeacon scan results — [Company]

Hi [Name],

Attached is your free Simplebeacon assessment. Headline: **[paste executiveSummary.headline]**.

If useful, I can open a PR that adds `simplebeacon scan --gate` to your GitHub Actions workflow (~15 minutes).

[Your name]
