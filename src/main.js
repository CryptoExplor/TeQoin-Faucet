import { FAUCET_TOKENS, APP_METADATA, LINKS, WALLET_LOOKUP_API, isLikelyAddress } from './config.js';
import { claimFaucet } from './faucet.js';

document.title = APP_METADATA.name;

// ─────────────────────────────────────────────────────────────────────────────
// Telegram Mini App bootstrap
// Works in a normal browser too (tg is undefined then) for dev/testing.
// ─────────────────────────────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#080C10');
    tg.setBackgroundColor('#080C10');
  } catch {
    /* older client — ignore */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM refs
// ─────────────────────────────────────────────────────────────────────────────
const els = {
  addressInput: document.getElementById('address-input'),
  addressHint: document.getElementById('address-hint'),
  pasteBtn: document.getElementById('paste-btn'),
  detectBtn: document.getElementById('detect-btn'),
  teqoinWalletBtn: document.getElementById('teqoin-wallet-btn'),
  autofetchRow: document.getElementById('autofetch-row'),
  autofetchStatus: document.getElementById('autofetch-status'),
  autofetchSpinner: document.getElementById('autofetch-spinner'),
  walletLinks: document.getElementById('wallet-app-links'),
  metamaskLink: document.getElementById('metamask-link'),
  trustLink: document.getElementById('trust-link'),
  tokenGrid: document.getElementById('token-grid'),
  claimBtn: document.getElementById('claim-btn'),
  statusBox: document.getElementById('status-box'),
  // logo
  logoImg: document.getElementById('logo-img'),
  logoFallback: document.getElementById('logo-fallback'),
  logoTextImg: document.getElementById('logo-text-img'),
  headerH1: document.getElementById('header-h1'),
  // links
  explorerLink: document.getElementById('explorer-link'),
};

// Set static hrefs
els.explorerLink.href = LINKS.explorer;

// ─────────────────────────────────────────────────────────────────────────────
// Auto-fetch wallet address from TeQoin backend using Telegram user ID
//
// HOW IT WORKS:
//   1. Telegram passes tg.initData to every Mini App — it contains the user's
//      Telegram user ID, signed with HMAC so it cannot be forged.
//   2. We send that raw initData string to the TeQoin API as proof of identity.
//   3. The backend validates the hash, finds the wallet for that user ID,
//      and returns it.
//
// TO ACTIVATE:
//   Ask the TeQoin team to expose an endpoint such as:
//     POST https://api2.teqoin.io/api/v1/User/Wallet
//     Body: { initData: "..." }
//     Response: { wallet: "0x..." }
//
//   Then set WALLET_LOOKUP_API in src/config.js to that URL.
//   While it is null the auto-fetch is silently skipped.
// ─────────────────────────────────────────────────────────────────────────────
async function tryAutoFetchWallet() {
  // Silently skip if API not configured yet
  if (!WALLET_LOOKUP_API) return;

  // Only run inside Telegram where initData is available
  const initData = tg?.initData;
  if (!initData) return;

  // Already has an address — don't overwrite user's input
  if (isLikelyAddress(els.addressInput.value)) return;

  // Show loading state
  els.autofetchRow.classList.add('visible');
  els.autofetchStatus.textContent = 'Looking up your TeQoin wallet\u2026';
  els.autofetchSpinner.style.display = 'block';

  try {
    const res = await fetch(WALLET_LOOKUP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ initData }),
      signal: AbortSignal.timeout(6000),
    });

    // 503 = TEQOIN_WALLET_API env var not configured on server yet — silent fallback
    if (res.status === 503) { els.autofetchRow.classList.remove('visible'); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const wallet = data?.wallet || data?.address || data?.walletAddress || '';

    if (isLikelyAddress(wallet)) {
      els.addressInput.value = wallet;
      validateAddress();
      // Update status to success (hide spinner, show tick)
      els.autofetchSpinner.style.display = 'none';
      els.autofetchStatus.textContent = '\u2713 Wallet auto-filled from your TeQoin account';
      setHint('Wallet address loaded from @TeQoin_Wallet_Bot \u2713', 'success');
    } else {
      els.autofetchRow.classList.remove('visible');
    }
  } catch {
    // Silently hide on error — don't alarm the user
    els.autofetchRow.classList.remove('visible');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TeQoin Wallet Bot button
// ─ Inside Telegram: uses tg.openTelegramLink for seamless in-app navigation
// ─ Outside Telegram (browser dev): falls back to window.open
// When the user returns to the mini-app after visiting the wallet bot,
// tg.onEvent('activated') fires and we auto-try clipboard paste so their
// copied address fills in with zero effort.
// ─────────────────────────────────────────────────────────────────────────────
const WALLET_BOT_URL = 'https://t.me/TeQoin_Wallet_Bot';

els.teqoinWalletBtn.addEventListener('click', () => {
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(WALLET_BOT_URL);
  } else {
    window.open(WALLET_BOT_URL, '_blank', 'noopener');
  }
});

// When user returns to the faucet after visiting the wallet bot,
// auto-try to read whatever they copied from the clipboard.
if (tg) {
  const handleActivated = async () => {
    // Only auto-paste if address field is still empty
    if (isLikelyAddress(els.addressInput.value)) return;
    try {
      const text = await navigator.clipboard.readText();
      if (isLikelyAddress(text.trim())) {
        els.addressInput.value = text.trim();
        validateAddress();
        setHint('Address pasted from clipboard \u2713', 'success');
      }
    } catch {
      /* clipboard permission denied — user can paste manually */
    }
  };

  // Telegram Mini App v6.9+ fires 'activated' when the app regains focus
  tg.onEvent('activated', handleActivated);
  // Also listen for the page becoming visible again (standard browser API)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') handleActivated();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Logo helper to avoid race conditions if images are already cached/loaded
function initLogo(img, onSuccess, onFailure) {
  if (img.complete) {
    if (img.naturalWidth > 0) {
      onSuccess();
    } else {
      onFailure();
    }
  } else {
    img.addEventListener('load', onSuccess);
    img.addEventListener('error', onFailure);
  }
}

initLogo(els.logoImg,
  () => {
    els.logoImg.style.display = 'block';
    if (els.logoFallback) els.logoFallback.style.display = 'none';
  },
  () => {
    els.logoImg.style.display = 'none';
    if (els.logoFallback) els.logoFallback.style.display = 'flex';
  }
);

initLogo(els.logoTextImg,
  () => {
    els.logoTextImg.style.display = 'block';
    if (els.headerH1) els.headerH1.style.display = 'none';
  },
  () => {
    els.logoTextImg.style.display = 'none';
    if (els.headerH1) els.headerH1.style.display = '';
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Token grid rendering with official brand colors and SVGs
// ─────────────────────────────────────────────────────────────────────────────
const TOKEN_COLORS = {
  ETH: '#8B8EFF',
  USDT: '#26A17B',
  USDC: '#2775CA',
  DAI: '#FBCC5F',
};

const TOKEN_ICONS = {
  ETH: `<svg width="20" height="20" viewBox="0 0 784 1277" fill="currentColor" style="display:block;"><path d="M392 0L383.6 28.4v844.3l8.4 8.4 392-231.9z" opacity=".6"/><path d="M392 0L0 649.2l392 231.9V0z"/><path d="M392 956L387.2 961.8v309.4l4.8 5.8 392.2-551.4z" opacity=".6"/><path d="M392 1277V956L0 725.2l392 551.8z"/><path d="M392 881L784 649.2 392 472.4z" opacity=".6"/><path d="M392 881L0 649.2l392-176.8z"/></svg>`,
  USDT: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="web3icons">
    <path fill="#009393" d="m12 19.2-9-8.88L6.433 4.8h11.134L21 10.32zm.9-8.1v-1.098c1.62.08 3.132.396 3.6.805-.544.477-2.493.824-4.5.824s-3.956-.347-4.5-.824c.463-.41 1.98-.72 3.6-.81V11.1zm-5.4-.297v.661c.463.41 1.975.72 3.6.81V14.7h1.8v-2.43c1.62-.081 3.136-.396 3.6-.806v-1.318c-.464-.41-1.98-.725-3.6-.81V8.4h2.7V7.05H8.4V8.4h2.7v.936c-1.625.085-3.137.4-3.6.81z"/></svg>`,
  USDC: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="web3icons">
    <path fill="#0B53BF" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18"/>
    <path fill="#fff" d="M13.62 5.45v1.159a5.64 5.64 0 0 1 4.005 5.394 5.64 5.64 0 0 1-4.005 5.394v1.16a6.74 6.74 0 0 0 5.13-6.554 6.74 6.74 0 0 0-5.13-6.553m-7.245 6.553a5.64 5.64 0 0 1 4.005-5.394V5.45a6.74 6.74 0 0 0-5.13 6.553 6.74 6.74 0 0 0 5.13 6.553v-1.159a5.63 5.63 0 0 1-4.005-5.394"/>
    <path fill="#fff" d="M14.419 13.258c0-2.301-3.606-1.356-3.606-2.627 0-.456.366-.748 1.063-.748.833 0 1.12.405 1.21.95h1.147c-.102-1.024-.69-1.67-1.67-1.863v-.904h-1.125v.872c-1.075.137-1.75.762-1.75 1.693 0 2.312 3.611 1.445 3.611 2.694 0 .472-.455.787-1.226.787-1.007 0-1.339-.444-1.462-1.057H9.49c.073 1.122.764 1.823 1.947 1.999v.886h1.125v-.875c1.153-.149 1.856-.82 1.856-1.807"/>
    </svg>`,
  DAI: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="web3icons"> <path fill="#FDC134" fill-rule="evenodd" d="M11.675 3.871H4.742v5.226H3v2.323h1.742v1.16H3v2.323h1.742v5.226h6.933a8.17 8.17 0 0 0 7.63-5.226H21v-2.322h-1.185a8 8 0 0 0 0-1.162H21V9.098h-1.695a8.18 8.18 0 0 0-7.63-5.226m5.806 8.71q.06-.58 0-1.162H7.065v1.162h10.422zM7.065 14.904v2.903h4.482c2.207 0 4.14-1.167 5.168-2.903zm0-5.807h9.656a6 6 0 0 0-5.168-2.903H7.065z" clip-rule="evenodd"/> </svg>`,
};

let nativeOnly = true;

function renderTokenGrid() {
  els.tokenGrid.innerHTML = '';
  FAUCET_TOKENS.forEach((t) => {
    const active = t.alwaysIncluded || !nativeOnly;
    const color = TOKEN_COLORS[t.symbol] || 'var(--tq-accent)';
    const icon = TOKEN_ICONS[t.symbol] || t.symbol[0];

    const card = document.createElement('div');
    card.className = `token-card ${active ? 'active' : 'inactive'}`;
    card.style.setProperty('--token-color', color);

    card.innerHTML = `
      <div class="token-icon">${icon}</div>
      <div class="token-info">
        <div class="token-sym">${t.label}</div>
        <div class="token-amt">${active ? t.amountLabel : 'not included'}</div>
      </div>
    `;
    els.tokenGrid.appendChild(card);
  });
}
renderTokenGrid();

// ─────────────────────────────────────────────────────────────────────────────
// ETH-only ↔ ETH+Stablecoins toggle
// ─────────────────────────────────────────────────────────────────────────────
document.querySelectorAll('.toggle-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    nativeOnly = btn.dataset.native === 'true';
    document.querySelectorAll('.toggle-btn').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    renderTokenGrid();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Address validation
// ─────────────────────────────────────────────────────────────────────────────
function setHint(text, type = '') {
  els.addressHint.textContent = text;
  els.addressHint.className = `hint ${type}`;
}

function validateAddress() {
  const val = els.addressInput.value.trim();
  if (val === '') { setHint(''); els.addressInput.classList.remove('invalid'); }
  else if (!isLikelyAddress(val)) {
    els.addressInput.classList.add('invalid');
    setHint('Not a valid 0x address — must be 42 hex characters.', 'error');
  } else {
    els.addressInput.classList.remove('invalid');
    setHint('');
  }
  updateClaimEnabled();
}

function updateClaimEnabled() {
  const ok = isLikelyAddress(els.addressInput.value);
  els.claimBtn.disabled = !ok;
  els.claimBtn.textContent = ok ? 'Claim Tokens' : 'Enter your address to claim';
  setTelegramMainButton(ok);
}

els.addressInput.addEventListener('input', validateAddress);

// ─────────────────────────────────────────────────────────────────────────────
// Paste button (Clipboard API, with graceful fallback)
// ─────────────────────────────────────────────────────────────────────────────
els.pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      els.addressInput.value = text.trim();
      validateAddress();
      if (isLikelyAddress(text.trim())) setHint('Address pasted ✓', 'success');
    }
  } catch {
    /* clipboard permission denied – user can paste manually */
    els.addressInput.focus();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Detect from injected wallet (MetaMask, in-app browsers, etc.)
// No signature is ever requested — we only read the address.
// ─────────────────────────────────────────────────────────────────────────────
function currentHost() {
  return window.location.host + window.location.pathname;
}

els.detectBtn.addEventListener('click', async () => {
  if (!window.ethereum) {
    els.walletLinks.classList.remove('hidden');
    els.metamaskLink.href = `https://metamask.app.link/dapp/${currentHost()}`;
    els.trustLink.href = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(window.location.href)}`;
    setHint('No wallet detected. Use the links below, or paste your address.', '');
    return;
  }
  try {
    els.detectBtn.disabled = true;
    els.detectBtn.querySelector('span') && (els.detectBtn.querySelector('span').textContent = 'Requesting…');

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (accounts?.[0]) {
      els.addressInput.value = accounts[0];
      validateAddress();
      setHint('Address detected from your wallet ✓', 'success');
    }
  } catch (err) {
    setHint(`Could not read address: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    els.detectBtn.disabled = false;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Telegram MainButton mirror
// ─────────────────────────────────────────────────────────────────────────────
function setTelegramMainButton(visible) {
  if (!tg?.MainButton) return;
  if (visible) {
    tg.MainButton.setText('CLAIM TOKENS');
    tg.MainButton.setParams({ color: '#17E3C4', text_color: '#040A0C' });
    tg.MainButton.show();
  } else {
    tg.MainButton.hide();
  }
}
if (tg?.MainButton) tg.MainButton.onClick(handleClaim);

// ─────────────────────────────────────────────────────────────────────────────
// Status helper
// ─────────────────────────────────────────────────────────────────────────────
function setStatus(html, type = '') {
  els.statusBox.innerHTML = html;
  els.statusBox.className = `status-box ${type}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim
// Requests go browser → TeQoin API directly, carrying the USER's real IP.
// No server proxy involved.
// ─────────────────────────────────────────────────────────────────────────────
let claiming = false;

async function handleClaim() {
  if (claiming) return;
  const wallet = els.addressInput.value.trim();
  if (!isLikelyAddress(wallet)) {
    setStatus('Enter a valid wallet address first.', 'error');
    return;
  }

  claiming = true;
  els.claimBtn.disabled = true;
  els.claimBtn.innerHTML = '<span class="spinner"></span>Claiming…';

  if (tg?.MainButton) {
    tg.MainButton.showProgress(false);
    tg.MainButton.disable();
  }

  setStatus('Sending request to TeQoin faucet…');

  try {
    const result = await claimFaucet({ wallet, nativeOnly });

    if (result.success) {
      const txPart = result.txHash
        ? ` &nbsp;<a href="${LINKS.explorer}/tx/${result.txHash}" target="_blank" rel="noopener">${result.txHash.slice(0, 12)}…↗</a>`
        : '';
      setStatus(`✅ Claimed successfully!${txPart}`, 'success');
      tg?.HapticFeedback?.notificationOccurred('success');
    } else {
      setStatus(result.message || 'Claim failed. Try again later.', 'error');
      tg?.HapticFeedback?.notificationOccurred('error');
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), 'error');
    tg?.HapticFeedback?.notificationOccurred('error');
  } finally {
    claiming = false;
    updateClaimEnabled();
    if (tg?.MainButton) {
      tg.MainButton.hideProgress();
      tg.MainButton.enable();
    }
  }
}

els.claimBtn.addEventListener('click', handleClaim);
updateClaimEnabled();

// Attempt to auto-fill wallet from TeQoin backend on load.
// Silent no-op while WALLET_LOOKUP_API is null in config.js.
tryAutoFetchWallet();
