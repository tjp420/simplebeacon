# GitHub Action Quickstart

Copy one of these workflows to `.github/workflows/simplebeacon.yml` in your repository.

## Option A — npx (fastest for prospects)

No install required. Commit `.simplebeacon/config.json` first (`npx simplebeacon init`).

```yaml
name: Simplebeacon

on:
  pull_request:
  push:
    branches: [main, master]

permissions:
  contents: read
  pull-requests: write

jobs:
  simplebeacon:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run simplebeacon gate
        run: |
          npx --yes simplebeacon scan \
            --format json \
            --output .simplebeacon/report.json \
            --gate \
            --verbose

      - name: Post PR comment
        if: github.event_name == 'pull_request' && always()
        run: npx --yes simplebeacon comment --report .simplebeacon/report.json --print-only | tee -a "$GITHUB_STEP_SUMMARY"
        env:
          GITHUB_TOKEN: ${{ github.token }}
          GITHUB_REPOSITORY: ${{ github.repository }}
          GITHUB_EVENT_PULL_REQUEST_NUMBER: ${{ github.event.pull_request.number }}

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: simplebeacon-report
          path: .simplebeacon/report.json
          if-no-files-found: ignore
```

## Option B — Composite action (monorepo / vendored)

From a repo that contains `ai-platform/action/action.yml`:

```yaml
name: Simplebeacon

on:
  pull_request:
  push:
    branches: [main, master]

permissions:
  contents: read
  pull-requests: write

jobs:
  simplebeacon:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: ./ai-platform/action
        with:
          path: .
          fail-on: high
          post-comment: true
```

## Gate behavior

| Flag | Effect |
|------|--------|
| `--gate` | Exit 1 when severities in `gate.failOn` are found (default: `high`) |
| `--fail-on high,medium` | Override config for this run |

Configure long-term policy in `.simplebeacon/config.json`:

```json
{
  "gate": {
    "failOn": ["high"],
    "warnOn": ["medium", "low"]
  }
}
```

## First-time setup checklist

1. `npx simplebeacon init --profile standard` (or `minimal` for credentials + production-leak only)
2. Commit `.simplebeacon/config.json` and `.simplebeacon/baseline.json`
3. Run locally: `npx simplebeacon scan --gate`
4. Add workflow above
5. Open a PR — comment + job summary appear automatically

## Outreach assessments

Generate a customer deliverable after a local or CI scan:

```bash
npx simplebeacon scan --format json --output .simplebeacon/report.json --gate
npx simplebeacon assess --company "Acme Corp" --assessor "Your Name" --output assessments/acme.json
```

See [OUTREACH.md](./OUTREACH.md) and [examples/outreach-tracker.md](./examples/outreach-tracker.md).
