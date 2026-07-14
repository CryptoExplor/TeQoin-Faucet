/**
 * Telegram initData utilities for Vercel serverless functions.
 *
 * Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * NEVER import this on the frontend — it uses Node's `crypto` module
 * and handles the bot token which must stay server-side only.
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// validateInitData
// Returns true if the initData string was genuinely issued by Telegram
// for the bot identified by botToken.
// ---------------------------------------------------------------------------
export function validateInitData(initData, botToken) {
  if (!initData || !botToken) return false;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) return false;

  // Remove hash before computing the check string
  params.delete('hash');

  // Telegram spec: sort keys alphabetically, join as key=value\n
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // secret_key = HMAC-SHA256(bot_token, "WebAppData")
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(computedHash, 'hex'),
    Buffer.from(receivedHash.padEnd(computedHash.length, '0').slice(0, computedHash.length), 'hex')
  );
}

// ---------------------------------------------------------------------------
// parseInitData
// Returns a plain object with all initData fields.
// JSON-encoded fields (e.g. "user") are automatically parsed.
// ---------------------------------------------------------------------------
export function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const result = {};
  for (const [key, value] of params.entries()) {
    try {
      result[key] = JSON.parse(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// checkInitDataAge
// Returns true if the initData auth_date is within maxAgeSeconds of now.
// Telegram recommends rejecting stale initData (> 1 hour old).
// ---------------------------------------------------------------------------
export function checkInitDataAge(parsed, maxAgeSeconds = 3600) {
  const authDate = Number(parsed?.auth_date);
  if (!authDate) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  return ageSeconds >= 0 && ageSeconds <= maxAgeSeconds;
}
