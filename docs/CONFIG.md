# Configuration Reference

## Profiles

| Profile | Use case | Rules enabled |
|---------|----------|---------------|
| `minimal` | Any repo, quick start | credentials, production-leak |
| `standard` | Generic projects with mock JSON | all rules, generic fiction patterns |
| `cascade` | ai-platform dashboard monorepo | all rules + cascade anchors and allowlists |

```bash
npx simplebeacon init --profile minimal
```

## `.simplebeacon/config.json`

```json
{
  "profile": "standard",
  "scanPaths": ["fixtures", "__mocks__", "data"],
  "productionPaths": ["src/", "server/"],
  "sampleDir": "data",
  "consistencyAnchorSamples": [],
  "ignore": ["node_modules/**", "tests/**", "**/*.test.js"],
  "rules": {
    "credentials": { "enabled": true, "scanProduction": true },
    "json-schema": { "enabled": true },
    "sample-consistency": { "enabled": true },
    "roadmap": { "enabled": true },
    "production-leak": {
      "enabled": true,
      "severity": "high",
      "productionPaths": ["src/"],
      "allowlistFiles": []
    },
    "jest-baseline": {
      "enabled": false,
      "runTests": false,
      "testCommand": "npm test -- --no-coverage --passWithNoTests"
    }
  },
  "gate": {
    "failOn": ["high"],
    "warnOn": ["medium", "low"]
  }
}
```

## `.simplebeacon/baseline.json`

Stores measured KPIs for consistency and Jest baseline rules:

```json
{
  "dataSource": "repository-audit",
  "jestTestsPassing": 578,
  "jestTestsLabel": "578/578",
  "jestSuites": 27,
  "rejectedFiction": {}
}
```

Sync after a green test run:

```bash
npx simplebeacon baseline sync
```

## Auto-detection

On `init`, simplebeacon detects:

- Common mock directories (`fixtures`, `__mocks__`, `web/data`, etc.)
- Production code paths (`src/`, `server/`, `lib/`)
- Cascade monorepo layout → `cascade` profile
- Package manager (npm/yarn/pnpm)

## Validation

Invalid config files produce warnings with `--verbose`:

```bash
npx simplebeacon scan --verbose
```
