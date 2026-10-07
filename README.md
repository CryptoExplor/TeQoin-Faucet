# TeQoin Faucet — Telegram Mini App

An unofficial, premium Telegram Mini App faucet client for the TeQoin L2 Testnet.

## Supported Tokens
- **ETH** (Native L2 gas tokens)
- **USDT** (25 tokens)
- **USDC** (25 tokens)
- **DAI** (25 tokens)

---

## Setup & Running Locally

```bash
# Install dependencies
npm install

# Run the dev server (vite proxies /api/claim → TeQoin for local testing)
npm run dev

# Closer to production: runs the real /api/claim + /api/get-wallet functions
npx vercel dev

# Build the production bundle
npm run build
```

---

## How claims work (and why there's a proxy)

The frontend does **not** call TeQoin's API directly. TeQoin's server only sends
CORS headers for its own origin (`https://teqoin.io`), so a browser `fetch()`
from this app's domain fails before the request even leaves:

> Access to fetch at 'https://api2.teqoin.io/api/v1/Faucet/Claim' … has been
> blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present.

CORS is enforced by browsers only — server-to-server calls are unaffected. So:

1. The mini-app POSTs `{ wallet, nativeOnly }` to the **same-origin**
   endpoint `POST /api/claim` (a Vercel serverless function, no CORS involved).
2. `/api/claim.js` validates the payload and forwards it to
   `https://api2.teqoin.io/api/v1/Faucet/Claim`.
3. TeQoin's status + body are passed back to the browser verbatim, so
   cooldowns and rate-limit errors surface exactly as the official API returns
   them.

To keep TeQoin's *"one address per day, per device and IP"* limits fair, the
proxy forwards the real client IP (`X-Forwarded-For` / `X-Real-IP`) and the
user's `User-Agent` instead of letting every user appear as one Vercel IP. It
also applies a light 10-second per-IP guard so the function itself can't be
hammered in a tight loop — this is far below any legitimate retry cadence and
does not replace TeQoin's 24h cooldown.

The official faucet lives at https://teqoin.io/faucet — it works without a
proxy because its origin is the one TeQoin's API allow-lists.

---

## Deployment to Vercel

```bash
vercel
```
This project deploys as a Vite SPA plus serverless functions under `api/`
using the included `vercel.json` configuration. No environment variables are
required for claiming. (`FAUCET_BOT_TOKEN` / `TEQOIN_WALLET_API` are only used
by the optional `/api/get-wallet` Telegram auto-fill.)

---

## Telegram Bot & Mini App Configuration

1. Open **@BotFather** on Telegram.
2. Create a new bot using `/newbot` (named `@TeQoin_Wallet_Bot` or similar).
3. Create a new app using `/newapp`, select your bot, and enter your Vercel deployment URL.
4. Set the WebApp as the bot menu button via `/setmenubutton`.

---

## Project Structure

```text
├── index.html            # Core HTML with Outfit font & glassmorphism CSS
├── vercel.json           # Vercel build + functions + routing config
├── package.json          # Dependency definition
├── api/
│   ├── claim.js          # Same-origin claim proxy → api2.teqoin.io (fixes CORS)
│   ├── get-wallet.js     # Telegram wallet auto-fill (optional)
│   └── utils/
│       └── telegram.js   # initData HMAC validation (server-side only)
├── public/               # Public assets
│   ├── manifest.json     # PWA / Web app manifest
│   ├── logoWithText.webp # Official TeQoin logo asset
│   └── web-app-manifest-192x192.png / web-app-manifest-512x512.png
└── src/
    ├── config.js         # API and token list configurations
    ├── faucet.js          # Claim client (POSTs to /api/claim)
    ├── analytics.js      # Vercel Analytics + Speed Insights + claim events
    └── main.js           # DOM controllers & wallet address listeners
```

## Analytics

Vercel **Web Analytics** (page views) and **Speed Insights** (performance) are
initialized in `src/analytics.js`, plus privacy-safe custom events for the
claim funnel — `claim_attempt`, `claim_success`, `claim_failed` (with coarse
`reason`: `cooldown` / `rate_limited` / `api_unreachable` / `invalid_address` /
`faucet_empty` / `other`), `claim_mode_changed`, and `wallet_autofilled`.
Wallet addresses, tx hashes, and raw API messages are never tracked. Events
appear in the Vercel dashboard for production deployments.

## License
MIT
