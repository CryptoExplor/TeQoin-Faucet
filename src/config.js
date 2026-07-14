// ============================================================================
// TeQoin Testnet Faucet — configuration
// ============================================================================

// Official faucet endpoint (POST { wallet, nativeOnly }).
// Requests are sent directly from the user's browser → their real IP is used,
// not a Vercel server proxy.
export const FAUCET_API = 'https://api2.teqoin.io/api/v1/Faucet/Claim';

// nativeOnly: true  → ETH only
// nativeOnly: false → ETH + USDT + USDC + DAI (25 each)
export const FAUCET_TOKENS = [
  { symbol: 'ETH',  label: 'ETH',  alwaysIncluded: true,  amountLabel: '0.001 ETH' },
  { symbol: 'USDT', label: 'USDT', alwaysIncluded: false, amountLabel: '25 tokens' },
  { symbol: 'USDC', label: 'USDC', alwaysIncluded: false, amountLabel: '25 tokens' },
  { symbol: 'DAI',  label: 'DAI',  alwaysIncluded: false, amountLabel: '25 tokens' },
];

export const LINKS = {
  telegram: 'https://t.me/TeQoin_Wallet_Bot',
  explorer: 'https://testnet-blockscan.teqoin.io',
};

export const APP_METADATA = {
  name: 'TeQoin Faucet',
  description: 'Claim TeQoin L2 testnet tokens – ETH, USDT, USDC & DAI – directly to your wallet.',
};

// EIP-55 format check (catches typos before hitting the API).
export function isLikelyAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test((value || '').trim());
}
