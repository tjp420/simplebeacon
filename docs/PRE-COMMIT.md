# Pre-commit & pre-push hooks (Community tier)

Community includes unlimited **local** scans with gate policy. Wire a hook once and Simplebeacon blocks fiction before it lands.

## One-command install

```bash
npx simplebeacon init
npx simplebeacon hook install              # .husky/pre-commit or .git/hooks/pre-commit
npx simplebeacon hook install --type pre-push --with-jest
```

Husky is used when `.husky/` exists; otherwise a plain Git hook is written under `.git/hooks/`. If the directory is not a Git repo, the script is saved under `.simplebeacon/hooks/` for manual wiring.

## Manual (copy/paste)

Copy [examples/hooks/pre-commit](../examples/hooks/pre-commit) to `.husky/pre-commit` or `.git/hooks/pre-commit` and `chmod +x` the file.

## npm scripts (alternative)

```json
{
  "scripts": {
    "simplebeacon:gate": "simplebeacon scan --gate --fail-on high",
    "prepare": "husky"
  }
}
```

Then in `.husky/pre-commit`:

```sh
npm run simplebeacon:gate
```

## What runs

| Hook | Command |
|------|---------|
| pre-commit | `simplebeacon scan --gate --fail-on high` |
| pre-push | `simplebeacon scan --gate --with-jest --fail-on high` |

Reports are printed to the terminal (text). Use `--format json --output .simplebeacon/report.json` in CI for artifacts.
