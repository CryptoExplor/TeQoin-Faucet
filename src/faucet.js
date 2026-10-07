// ============================================================================
// Faucet claim client — talks to our same-origin proxy at /api/claim.
// ----------------------------------------------------------------------------
// Why not call TeQoin's API directly? Their server only returns CORS headers
// for https://teqoin.io, so browsers refuse cross-origin fetch() from this
// app's domain ("No 'Access-Control-Allow-Origin' header is present").
// The proxy forwards server-to-server — where CORS doesn't apply — and passes
// TeQoin's response (including cooldown / rate-limit errors) back verbatim.
// The user's real IP is forwarded via X-Forwarded-For so upstream per-IP
// limits still identify each user individually.
//
// Deliberately minimal:
//   - No fingerprint / User-Agent spoofing.
//   - No multi-wallet queue, no retry-until-it-slips-past-a-rate-limit logic.
// If TeQoin's API says cooldown or rate-limited, that's surfaced to the user
// as-is rather than worked around.
// ============================================================================
import { FAUCET_API } from './config.js';

export async function claimFaucet({ wallet, nativeOnly }) {
  let res;
  try {
    res = await fetch(FAUCET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ wallet, nativeOnly }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach the faucet service (${err instanceof Error ? err.message : 'network error'}). ` +
        `Check your connection and try again.`,
    );
  }

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* response wasn't JSON - handled below */
  }

  if (json?.data?.success === true) {
    return { success: true, txHash: json.data.transactionHash || '' };
  }

  let message = '';
  if (json?.errors) {
    message = Array.isArray(json.errors) ? json.errors.join(', ') : String(json.errors);
  } else if (json?.data?.message) {
    message = json.data.message;
  } else if (json?.error) {
    // Shape used by our own proxy for pre-upstream failures
    // (validation, rate guard, upstream unreachable).
    message = String(json.error);
  } else if (!res.ok) {
    message = `HTTP ${res.status}: ${text.slice(0, 120)}`;
  } else {
    message = text.slice(0, 120) || 'Unknown response from faucet API.';
  }

  return { success: false, message };
}
