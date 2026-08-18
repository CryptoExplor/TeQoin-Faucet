# TeQoin-Faucet — Code Quality & Review Audit

Date: 2026-08-19 · Branch: `arena/01a01634-teqoin-faucet`

## Scope

- `index.html` (755 LOC — markup + CSS)
- `src/config.js`, `src/faucet.js`, `src/main.js`
- `api/get-wallet.js`, `api/utils/telegram.js`
- `package.json`, `vite.config.js`, `vercel.json`, `public/manifest.json`

---

## Verdict

Solid B+. Disciplined structure, strong XSS hygiene, correct Telegram HMAC validation, and
honest, well-written comments. Weaknesses are concentrated in doc/code drift, dead code and
unused assets, and an undermaintained engineering setup (no `.gitignore`, lockfile, tests, or CI).

---

## ✅ Strengths

1. **Clean layering** — `config` (constants) / `faucet` (API client) / `main` (DOM) /
   `api` (serverless). No god-file.
2. **XSS discipline** — all API/user-controlled text flows through `textContent`; the one
   place needing a link (tx hash) is built with explicit DOM nodes and validated against
   `/^0x[a-fA-F0-9]{64}$/`. Static `innerHTML` uses are constants only. Documented in code.
3. **Correct Telegram HMAC** — `validateInitData` follows the spec: secret key =
   `HMAC-SHA256("WebAppData", token)`, sorted `key=value\n` join, timing-safe compare.
4. **No secrets in source** — bot token only via `process.env.FAUCET_BOT_TOKEN`.
5. **Graceful degradation** — works in a plain browser (`tg` optional), clipboard/localStorage
   wrapped in try/catch, 503 → silent fallback to manual button.
6. **Re-entrancy guard** (`claiming`) prevents double-submit across DOM button + Telegram MainButton.
7. **Honest intent comments** — the faucet client documents *why* it doesn't spoof fingerprints,
   proxy, or route around rate limits.

---

## 🔴 Security / Robustness

### 1. `validateInitData` can throw → 500 instead of 401
`crypto.timingSafeEqual` throws `RangeError` on length mismatch. `Buffer.from(str, 'hex')`
truncates at the first invalid hex byte, so a malformed `hash` param yields a 0-length buffer
against the 32-byte computed hash → unhandled throw → HTTP 500. Not a bypass, but a cheap
500-trigger. **Fix:** assert `receivedHash` is exactly 64 hex chars before comparing.

### 2. Rate limiter is decorative for a faucet
In-memory `Map` resets on cold start and isn't shared across Vercel instances; initData is
replayable for up to 1 hour. The app has **zero Sybil protection of its own** — the claim goes
browser → TeQoin API directly, delegating all abuse control to TeQoin's `/Faucet/Claim`.
Acceptable architecture, but should be stated plainly in the README.

### 3. No CSP + render-blocking third-party scripts
Telegram SDK loads synchronously in `<head>`; Google Font via render-blocking `@import`.
A `Content-Security-Policy` meta tag would be cheap defense-in-depth given 3 external origins.

---

## 🟡 Correctness / Doc Drift

- **`WALLET_LOOKUP_API` docs are wrong** — `config.js` describes `GET` + `X-Telegram-Init-Data`
  header and "silently skips if null", but the value is `/api/get-wallet` and `main.js` sends a
  `POST` with a JSON body. Same stale "while it is null" note in `main.js`.
- **`isLikelyAddress` comment claims "EIP-55 format check"** but only regex-checks 40 hex chars
  (no checksum validation).
- **`LINKS.telegram` is dead** and inconsistent — the real bot URL (with `?startapp=r_1051107446`)
  is hardcoded in two places (`index.html` footer + `main.js` `WALLET_BOT_URL`).
- **`localeCompare` for initData key sort** — Telegram's reference uses deterministic ASCII
  ordering; prefer a plain `<` comparison.

---

## 🟢 Dead Code / Unused Assets

- `logo-fallback` / `.logo-mark` — referenced in JS/CSS, element absent from HTML.
- `els.detectBtn.querySelector('span')` — detect button has no `<span>`, so the "Requesting…"
  state is a silent no-op.
- Unreferenced `public/` assets: `banner.jfif`, `banner3.jpg`, `teqoin-icon-192.png`, `favicon.ico`
  (HTML actually uses `web-app-manifest-192x192.png` as the favicon).

---

## 🔵 Engineering Hygiene

- **No `.gitignore`** — `node_modules/`, `dist/`, `.env` at risk of being committed.
- **No lockfile** (`package-lock.json`) — `^`-ranged deps (`vite`, `@vercel/analytics`) can drift.
- **No tests / linter / formatter / CI** — the initData/HMAC logic especially deserves unit tests
  (valid signature, tampered field, expired `auth_date`, malformed hash).
- **Minor:** `user-scalable=no` blocks pinch-zoom (a11y); `AbortSignal.timeout()` is modern-only
  (fine in Telegram's webview, unguarded elsewhere).

---

## Suggested fix order

1. Harden `validateInitData` (hex + length pre-check).
2. Add `.gitignore` + commit `package-lock.json`.
3. Remove dead code / unused assets; consolidate the bot URL into `LINKS.telegram`.
4. Fix the `WALLET_LOOKUP_API` and `isLikelyAddress` comments.
5. Add unit tests for `api/utils/telegram.js`.
