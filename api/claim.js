/**
 * POST /api/claim
 *
 * Vercel Serverless Function — same-origin proxy for the TeQoin faucet API.
 *
 * WHY A PROXY?
 * TeQoin's API (https://api2.teqoin.io) only sends CORS headers for its own
 * origin (https://teqoin.io). Browsers block cross-origin fetch() calls from
 * any other domain (e.g. this app's vercel.app URL or the Telegram webview)
 * with:
 *
 *   "No 'Access-Control-Allow-Origin' header is present on the requested
 *    resource."
 *
 * CORS is a *browser* policy only — server-to-server requests are unaffected.
 * So the frontend POSTs to this same-origin endpoint, and this function
 * forwards the request to TeQoin's API and streams the response back.
 *
 * FAIRNESS / RATE LIMITS:
 * TeQoin rate-limits "one address per day, per device and IP". To keep that
 * working fairly (instead of every user appearing as one Vercel IP), we
 * forward the real client IP via X-Forwarded-For / X-Real-IP and pass through
 * the user's User-Agent. Upstream cooldowns and errors are returned verbatim.
 *
 * Request:  POST /api/claim   { wallet: "0x...", nativeOnly: true|false }
 * Response: upstream status + body, passed through untouched.
 *           Own errors use shape { error: "..." }.
 */

// Upstream TeQoin endpoint. Kept as a const (not env) so a fresh deploy works
// with zero configuration; override with TEQOIN_CLAIM_API if it ever moves.
const UPSTREAM_URL =
  process.env.TEQOIN_CLAIM_API || 'https://api2.teqoin.io/api/v1/Faucet/Claim';

// Upstream timeout (ms). Must stay under the function's maxDuration (10s in
// vercel.json) so we always reply with JSON instead of timing out silently.
const UPSTREAM_TIMEOUT_MS = 8_000;

// ─── Light abuse guard ──────────────────────────────────────────────────────
// In-memory: IP → last request timestamp. Resets on cold start, which is fine.
// This does NOT replace TeQoin's 24h cooldown — it just stops someone from
// hammering our serverless function in a tight loop. 10s is far below any
// legitimate retry cadence.
const lastSeenByIp = new Map();
const MIN_GAP_MS = 10_000;

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) return realIp.trim();
  return req.socket?.remoteAddress || 'unknown';
}

function isLikelyAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test((value || '').trim());
}

// Vercel's Node runtime usually pre-parses JSON bodies into req.body, but read
// the raw stream as a fallback so this also works under `vercel dev` and tests.
async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body || '{}');
      } catch {
        return null;
      }
    }
    if (typeof req.body === 'object') return req.body;
    return null;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // Same-origin endpoint, but allow cross-origin calls too (local dev on a
  // different port, Telegram webviews, previews) — this is OUR header to set.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Validate body before touching the upstream ────────────────────────────
  const body = await readJsonBody(req);
  if (!body) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const wallet = typeof body.wallet === 'string' ? body.wallet.trim() : '';
  if (!isLikelyAddress(wallet)) {
    return res.status(400).json({ error: 'A valid 0x wallet address is required' });
  }
  if (typeof body.nativeOnly !== 'boolean') {
    return res.status(400).json({ error: 'nativeOnly (boolean) is required' });
  }

  // ── Abuse guard (per client IP) ───────────────────────────────────────────
  const clientIp = getClientIp(req);
  const now = Date.now();
  const lastSeen = lastSeenByIp.get(clientIp);
  if (lastSeen && now - lastSeen < MIN_GAP_MS) {
    return res
      .status(429)
      .json({ error: 'Too many requests — please wait a few seconds and retry' });
  }
  lastSeenByIp.set(clientIp, now);

  // ── Forward to TeQoin ─────────────────────────────────────────────────────
  // NOTE: we deliberately do NOT send an Origin header. CORS/Origin checks
  // apply to browsers; a server-to-server call needs none.
  let upstream;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Preserve the user's identity for upstream per-IP rate limiting.
        'X-Forwarded-For': clientIp,
        'X-Real-IP': clientIp,
        'User-Agent': req.headers?.['user-agent'] || 'TeQoin-Faucet-Proxy/1.0',
      },
      // Forward the exact client payload so future fields (e.g. device
      // fingerprint) pass through without changing this proxy.
      body: JSON.stringify({ wallet, nativeOnly: body.nativeOnly }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[claim] Upstream unreachable for ${wallet.slice(0, 10)}…:`, message);
    return res.status(502).json({
      error: 'TeQoin faucet API is unreachable — try again in a moment',
    });
  }

  // ── Pass the upstream response straight through ───────────────────────────
  // Status code + body untouched so cooldowns / errors surface as-is.
  const text = await upstream.text();
  const contentType = upstream.headers.get('content-type') || 'application/json';
  res.setHeader('Content-Type', contentType);
  return res.status(upstream.status).send(text);
}
