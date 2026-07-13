# TeQoin Faucet - Telegram Mini App

An unofficial Telegram **Mini App** (not a bot) that lets someone claim TeQoin L2 testnet tokens for their *own* wallet. Static site, deployable to Vercel, zero backend.

## Why "Mini App, not bot" actually matters here

A Telegram **bot** runs your own code on a server, responding to messages via the Bot API - if it called TeQoin's faucet, the request would come from *your server's* IP, for every user, indistinguishable from one address farming many claims.

A Telegram **Mini App** is just a web page loaded in a WebView on the *visitor's own device*. All the JS in this repo - including the faucet claim `fetch()` in `src/faucet.js` - executes on their phone/desktop and goes out over their own network connection. That's the entire mechanism behind "uses the visitor's own IP": there is no server in the request path at all. **Don't add a Vercel serverless function or API route that relays the claim request** - that would reintroduce a shared server IP and defeat the whole point.

## Why there's no wallet-connect library

A faucet claim is `POST {wallet, nativeOnly}` - it needs a destination *address*, not a signature or transaction. There's nothing to sign, so there's no wagmi/AppKit/WalletConnect dependency here, which keeps this fast to load (matters for a Mini App opened from a Telegram button) and sidesteps a real dependency conflict I hit while building this: the wagmi ecosystem shipped a v3 line after my own knowledge cutoff, and the latest `@reown/appkit-adapter-wagmi` pulls it in as a peer dependency while wanting an incompatible `@wagmi/core` version underneath - a fight not worth having for a feature that doesn't need a wallet library at all.

Wallet input works two ways:
1. **Paste the address** - works everywhere, always.
2. **"Detect from injected wallet"** - calls `eth_requestAccounts` if `window.ethereum` exists (e.g. opened inside MetaMask's or Trust Wallet's own in-app browser). This only *reads* an address the visitor already controls - it never requests a signature.

If neither applies (plain Telegram, no injected provider), the app shows "Open in MetaMask" / "Open in Trust Wallet" deep links so the visitor can re-open the same URL inside their wallet's browser, where an injected provider will exist.

**Not included, on purpose:** WalletConnect (QR/deep-link connect for mobile wallets without an in-app browser). It's a legitimate thing to want, but adding it back means reintroducing that same dependency footprint. If you want it, the cleanest path is `@walletconnect/ethereum-provider` directly (not the full AppKit stack) - happy to wire that up if you'd like it as a next step.

## What's honest about this faucet client

`src/faucet.js` calls TeQoin's real faucet API (`api2.teqoin.io/api/v1/Faucet/Claim`) plainly:
- No User-Agent spoofing, no fingerprinting, no proxy rotation.
- One address, one request. No multi-wallet queue.
- If TeQoin's API says cooldown or rate-limited, that message is shown to the user as-is, not retried around.

## ⚠️ CORS - the one thing I couldn't verify

Browsers enforce CORS and don't let JS override the `Origin` header (unlike a Node.js script, which is how TeQoin's own reference client gets away with setting `Origin: https://teqoin.io` manually). If TeQoin's API only allows requests from their own official frontend's origin, a direct browser call from *your* Vercel domain will fail with a CORS error in the console - no workaround preserves "uses the visitor's own IP" if that happens, since any server-side relay reintroduces a shared IP. I don't have a way to test a real cross-origin browser request against their API from here. Deploy, try a claim, and check the browser console:
- **Works** → you're done, nothing else to do.
- **CORS error** → your only faithful options are asking TeQoin to allowlist your domain, or accepting a relay (which changes the trust model this app is built around - claims would then look like they come from your server).

## Setup

```bash
npm install
npm run dev
```

### Deploy to Vercel

```bash
vercel
```

Uses `vercel.json` already in the repo (static build, SPA rewrite, no functions).

### Register it as a Telegram Mini App (not a bot command)

1. Message **@BotFather** → `/newbot` if you don't have one yet (the bot itself needs zero code/logic - it only exists to host the Mini App entry point).
2. `/newapp`, select your bot, and enter your Vercel URL as the Web App URL.
3. Optionally set it as the bot's persistent menu button via `/mybots` → *Bot Settings* → *Menu Button*.
4. Open your bot in Telegram and tap the menu button / app link - it launches this page inside Telegram's WebView.

## Branding - please verify before shipping to real users

`app.teqoin.io` / `teqoin.io` are JS-rendered SPAs, so I couldn't pull exact hex codes or a verified logo file from them with the tools I had (and `faucet.teqoin.io` blocks automated fetches via robots.txt). Everything brand-specific lives in one place:

- **Colors**: the `:root` CSS variables at the top of `index.html`'s `<style>` block, clearly commented as an approximation.
- **Logo**: `index.html` tries loading `https://teqoin.io/favicon.ico` live and falls back to a plain "Tq" text mark if that path 404s. `public/icon.svg` (used for the Mini App's own icon/favicon) is a placeholder gradient mark I made, not an official asset.

Open your dev tools on `app.teqoin.io`, grab the real values, and drop them into those variables - nothing else needs to change.

## Token toggle

- **ETH only** → `nativeOnly: true`
- **ETH + Stablecoins** → `nativeOnly: false` (adds USDT/USDC/DAI)

The "~25 each" stablecoin amount shown in the UI is informational copy, not something this app calculates or controls - the API doesn't accept an amount parameter. Update `FAUCET_TOKENS` in `src/config.js` if TeQoin changes the actual payout.

## Project structure

```
├── index.html        # markup + theme (all brand values isolated at the top)
├── src/
│   ├── config.js      # faucet API, token list, links, address validator
│   ├── faucet.js       # the actual claim - plain fetch, no spoofing
│   └── main.js         # Telegram WebApp init, address input, claim wiring
├── public/icon.svg     # placeholder app icon
└── vercel.json         # static deploy, no serverless functions
```

## License

MIT
