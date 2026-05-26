# Publish simplebeacon to npm

Package: **simplebeacon** · registry: https://www.npmjs.com/package/simplebeacon  
Path: `ai-platform/packages/simplebeacon-cli`

**v1.0.0 is live.** For updates, bump version in `package.json` first (`npm version patch`).

---

## New granular access token (copy these fields)

Create at: https://www.npmjs.com/settings/tjp88/tokens → **Generate New Token** → **Granular Access Token**

| Field | Value |
|-------|--------|
| **Token name** | `simplebeacon-publish` |
| **Description** | `Publish simplebeacon CLI updates to npm` |
| **Bypass 2FA** | ✅ **Checked** (required for non-interactive publish) |
| **Allowed IP ranges** | Leave empty |
| **Packages and scopes → Permissions** | **Read and write** |
| **Packages and scopes → Packages** | **All packages** |
| **Organizations → Permissions** | **No access** |
| **Expiration** | **30 days** (or 90 days if you publish often) |

Before clicking **Generate**, confirm the summary says:

> Provide **read and write** access to packages and scopes  
> Provide **no** access to organizations

If it says “Provide **no** access to packages and scopes”, go back and fix permissions.

---

## Save token (do not use `npm config set` inside this monorepo)

`npm config set` fails with `ENOWORKSPACES` from `ai-platform/packages/*`.

1. Open **Notepad** → `C:\Users\Trevor\.npmrc`
2. Set one line (replace with your new token):

```
//registry.npmjs.org/:_authToken=npm_YOUR_TOKEN_HERE
```

3. Save. Verify from any folder:

```powershell
npm whoami
```

Should print: `tjp88`

**Never paste tokens in chat.** Revoke old tokens after rotating.

---

## Publish a new version

```powershell
cd C:\Users\Trevor\CascadeProjects\ai-platform\packages\simplebeacon-cli
npm version patch
npm test
npm publish --access public
```

Or run:

```powershell
.\publish.ps1
```

Verify:

```powershell
npm view simplebeacon version
```

---

## Option B — interactive 2FA (no token)

1. Delete or comment out `_authToken` in `C:\Users\Trevor\.npmrc`
2. `npm login` (password + authenticator OTP)
3. Publish with a **fresh** 6-digit code (not a placeholder):

```powershell
npm publish --access public --otp=123456
```

If authenticator OTP fails, try a **recovery code** from npm 2FA setup with `--otp=`.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `ENOWORKSPACES` on `npm config set` | Edit `C:\Users\Trevor\.npmrc` manually |
| `E403` + bypass 2FA message | Wrong token in `.npmrc`, or Bypass 2FA not checked when token was created |
| `E403` with `--otp=654321` | Use a real code from your app (codes expire every ~30s) |
| Token summary shows “no access to packages” | Set **Read and write** under Packages and scopes |

---

## Install (users)

```powershell
npm install -D simplebeacon
npx simplebeacon init
npx simplebeacon scan --gate --path .
```

Offline fallback: `/downloads/simplebeacon-1.0.0.tgz` on the landing site.
