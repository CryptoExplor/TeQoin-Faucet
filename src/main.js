import { FAUCET_TOKENS, APP_METADATA, LINKS, isLikelyAddress } from './config.js';
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
  ETH: `<img src="https://cdn.simpleicons.org/ethereum/8B8EFF" width="20" height="20" alt="ETH" style="display:block;" />`,
  USDT: `<img src="https://cdn.simpleicons.org/tether/26A17B" width="20" height="20" alt="USDT" style="display:block;" />`,
  USDC: `<img src="https://cdn.simpleicons.org/usdc/2775CA" width="20" height="20" alt="USDC" style="display:block;" />`,
  DAI: `<img src="https://cdn.simpleicons.org/dai/FBCC5F" width="20" height="20" alt="DAI" style="display:block;" />`,
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
