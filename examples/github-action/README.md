# GitHub Actions — zero-install PR gate

## 60-second pilot setup

Copy [`simplebeacon-gate.yml`](./simplebeacon-gate.yml) to your repository:

```text
.github/workflows/simplebeacon-gate.yml
```

No `.simplebeacon/config.json` required. The workflow runs:

```bash
npx --yes simplebeacon-audit --path=. --fail-on-slop --ci-ledger
```

- **`--fail-on-slop`** — fails the PR check when AI slop, mock paths, or gate violations are found
- **`--ci-ledger`** — when secrets are set, POSTs the scan to your compliance trail

## Repository secrets (optional, for dashboard + ledger)

| Secret | Value |
|--------|--------|
| `SIMPLEBEACON_API_URL` | `https://simplebeacon.ai` |
| `SIMPLEBEACON_TOKEN` | Cloud Teams `sb_…` token |

Events appear at `/app#/compliance-trail` after Postgres ingest is enabled on the host.

## Full workflow (config + PR comments)

For repos that already run `npx simplebeacon init`, use [`simplebeacon.yml`](./simplebeacon.yml) instead — gate scan, PR summary, artifact upload, and ledger ingress.
