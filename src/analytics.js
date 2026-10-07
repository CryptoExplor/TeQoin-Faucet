// ============================================================================
// Analytics — Vercel Web Analytics + Speed Insights + custom claim-funnel events.
// ----------------------------------------------------------------------------
// Privacy rules:
//   - NEVER track wallet addresses, tx hashes, Telegram IDs, or raw API
//     messages (they can contain anything). Only coarse, pre-defined labels.
//   - Events are fire-and-forget; a failure here must never break the app.
// Data only appears for production deployments in the Vercel dashboard —
// localhost / preview traffic is sampled out by Vercel automatically.
// ============================================================================
import { inject, track } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

export function initAnalytics() {
  try {
    inject(); // page views + Web Vitals for Analytics
    injectSpeedInsights(); // performance scores for Speed Insights
  } catch {
    /* analytics must never break the app (e.g. blocked beacon) */
  }
}

function safeTrack(event, data) {
  try {
    track(event, data);
  } catch {
    /* ignore — analytics is best-effort */
  }
}

// Collapse free-form failure messages into a small set of coarse labels so
// the dashboard stays readable and no sensitive text ever leaves the browser.
export function categorizeClaimError(message) {
  const m = (message || '').toLowerCase();
  if (/cool ?down|already claimed|24h|daily limit|once per day/.test(m)) return 'cooldown';
  if (/rate.?limit|too many|429/.test(m)) return 'rate_limited';
  if (/unreachable|fetch failed|network|timeout|502|503|504/.test(m)) return 'api_unreachable';
  if (/invalid.*address|valid.*address|0x/.test(m)) return 'invalid_address';
  if (/insufficient|empty|drained|out of funds/.test(m)) return 'faucet_empty';
  return 'other';
}

const claimMode = (nativeOnly) => (nativeOnly ? 'eth_only' : 'eth_plus_stables');

export function trackClaimAttempt(nativeOnly) {
  safeTrack('claim_attempt', { mode: claimMode(nativeOnly) });
}

export function trackClaimSuccess(nativeOnly) {
  safeTrack('claim_success', { mode: claimMode(nativeOnly) });
}

export function trackClaimFailed(nativeOnly, message) {
  safeTrack('claim_failed', {
    mode: claimMode(nativeOnly),
    reason: categorizeClaimError(message),
  });
}

export function trackModeChanged(nativeOnly) {
  safeTrack('claim_mode_changed', { mode: claimMode(nativeOnly) });
}

export function trackWalletAutofilled() {
  safeTrack('wallet_autofilled');
}
