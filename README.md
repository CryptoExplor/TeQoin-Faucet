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

# Run the dev server
npm run dev

# Build the production bundle
npm run build
```

---

## Deployment to Vercel

```bash
vercel
```
This project deploys as a fully static SPA using the included `vercel.json` configuration.

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
├── vercel.json           # Vercel static build routing config
├── package.json          # Dependency definition
├── public/               # Public assets
│   ├── manifest.json     # PWA / Web app manifest
│   ├── logoWithText.webp # Official TeQoin logo asset
│   └── web-app-manifest-192x192.png / web-app-manifest-512x512.png
└── src/
    ├── config.js         # API and token list configurations
    ├── faucet.js          # Direct client-side claim API call
    └── main.js           # DOM controllers & wallet address listeners
```

## License
MIT
