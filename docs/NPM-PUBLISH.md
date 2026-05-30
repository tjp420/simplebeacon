# npm publish checklist

Run before `npm publish` from `packages/simplebeacon-cli/`.

## Pre-flight

**Status (2026-05-30):** `npm test` + `pack:check` + MCP smoke pass. Package name `simplebeacon` is **available** on npm (404 on registry). Publish blocked only by **2FA OTP** at publish time.

```bash
cd packages/simplebeacon-cli
npm test
npm run pack:check
node bin/simplebeacon-mcp.js --smoke-test
```

## Publish (requires npm login + 2FA OTP)

npm requires **two-factor authentication** for publish. In your terminal:

```bash
cd packages/simplebeacon-cli
npm login                    # if needed — use OTP from authenticator app
npm publish --access public --otp=123456
```

Replace `123456` with your current 6-digit code from your authenticator app.

Or create a **Granular Access Token** at npmjs.com → Access Tokens → Publish (with bypass 2fa if your org allows), then:

```bash
npm config set //registry.npmjs.org/:_authToken=npm_...
npm publish --access public
```

## Package contents

Bins included: `simplebeacon`, `simplebeacon-mcp`, `simplebeacon-proxy`

Verify `files` in `package.json` includes `examples/` (MCP + CI templates).

## After publish

1. Update README badge: npm published  
2. Update `examples/github-action/simplebeacon.yml` to use `npx --yes simplebeacon` instead of `-p github:tjp420/simplebeacon`  
3. Update GETTING-STARTED.md install lines  
4. Tag release on GitHub  
5. Announce: `npx simplebeacon init --starter`

## Version bump

```bash
npm version patch   # or minor — only when ready to publish
npm publish --access public
```

## Post-publish smoke (clean temp dir)

```bash
mkdir /tmp/sb-test && cd /tmp/sb-test
npm init -y
npm install -D simplebeacon
npx simplebeacon init --starter
npx simplebeacon-mcp --smoke-test
```
