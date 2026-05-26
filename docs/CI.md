# CI Integration

**Quick copy:** [GITHUB-ACTION-QUICKSTART.md](./GITHUB-ACTION-QUICKSTART.md) — standalone `npx` workflow and composite action examples.

## GitHub Actions (monorepo)

```yaml
name: Simplebeacon
on: [pull_request, push]
jobs:
  simplebeacon:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: ai-platform
      - run: npm run simplebeacon:report
        working-directory: ai-platform
      - run: npm run simplebeacon:comment
        if: github.event_name == 'pull_request'
        working-directory: ai-platform
        env:
          GITHUB_TOKEN: ${{ github.token }}
```

## Composite action (standalone or monorepo)

```yaml
- uses: your-org/ai-platform/action@v1
  with:
    path: .
    fail-on: high
    with-jest: false
    post-comment: true
```

The action auto-detects monorepo layout (`packages/simplebeacon-cli`) or uses `npx simplebeacon` for external repos.

## GitLab CI

```yaml
simplebeacon:
  image: node:20
  script:
    - npm install -g simplebeacon
    - simplebeacon init --profile minimal
    - simplebeacon scan --gate --format json --output .simplebeacon/report.json
  artifacts:
    paths:
      - .simplebeacon/report.json
```

## CircleCI

```yaml
jobs:
  simplebeacon:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - run: npx simplebeacon scan --gate
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | Post PR comments |
| `GITHUB_REPOSITORY` | `owner/repo` slug |
| `GITHUB_EVENT_PULL_REQUEST_NUMBER` | PR number for comments |
| `NO_COLOR` | Disable colored CLI output |
| `CI=true` | Standard CI mode for Jest baseline |
| `SIMPLEBEACON_DASHBOARD_URL` | Optional webhook for live dashboard sync (see [DOCKER.md](./DOCKER.md)) |
| `SIMPLEBEACON_DASHBOARD_TOKEN` | Bearer token for dashboard webhook |

## Docker local stack

See [DOCKER.md](./DOCKER.md) for `docker-compose.simplebeacon.yml` — dashboard, metrics collector, and optional Postgres/Redis.
