// ============================================================================
// Faucet claim - a plain client for TeQoin's own faucet API.
// ----------------------------------------------------------------------------
// Deliberately minimal:
//   - No fingerprint / User-Agent spoofing - the browser sends its real one.
//   - No proxy - the request goes out over the visitor's own connection.
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, nativeOnly }),
    });
  } catch (err) {
    // Most likely cause here is TeQoin's API not sending CORS headers that
    // allow this app's origin - see the "CORS" section in README.md. Surface
    // it plainly rather than silently retrying or routing around it.
    throw new Error(
      `Could not reach the faucet API (${err instanceof Error ? err.message : 'network error'}). ` +
      `This usually means TeQoin's API doesn't allow browser requests from this domain (CORS) - see README.`,
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
  } else if (!res.ok) {
    message = `HTTP ${res.status}: ${text.slice(0, 120)}`;
  } else {
    message = text.slice(0, 120) || 'Unknown response from faucet API.';
  }

  return { success: false, message };
}
