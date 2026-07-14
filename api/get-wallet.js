/**
 * GET /api/get-wallet
 *
 * Vercel Serverless Function — server-side only.
 *
 * Flow:
 *   1. Mini App POSTs { initData } (raw Telegram.WebApp.initData string)
 *   2. This function validates the HMAC signature using FAUCET_BOT_TOKEN
 *   3. Extracts the Telegram user_id from initData
 *   4. Calls TeQoin backend (TEQOIN_WALLET_API env var) to retrieve wallet
 *   5. Returns { wallet: "0x..." } or { error: "..." }
 *
 * Environment variables (set in Vercel dashboard — never in source):
 *   FAUCET_BOT_TOKEN     — Bot token for @teqoinfaucetbot (from BotFather)
 *   TEQOIN_WALLET_API    — TeQoin endpoint that returns wallet for a user
 *                          e.g. https://api2.teqoin.io/api/v1/User/Wallet
 *                          Leave unset → function returns 503 (mini-app falls back to button)
 */

import { validateInitData, parseInitData, checkInitDataAge } from './utils/telegram.js';

// Simple in-memory rate limiter: userId → last request timestamp (ms)
// Resets on cold start, which is acceptable for this use case.
const rateLimitMap = new Map();
const RATE_LIMIT_MS = 30_000; // 30 seconds between requests per user

export default async function handler(req, res) {
  // ── CORS headers (Mini App origin is a Telegram webview) ────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Extract initData from request body ────────────────────────────────
  const { initData } = req.body ?? {};
  if (!initData || typeof initData !== 'string') {
    return res.status(400).json({ error: 'initData is required' });
  }

  // ── 2. Validate HMAC signature ───────────────────────────────────────────
  const botToken = process.env.FAUCET_BOT_TOKEN;
  if (!botToken) {
    console.error('[get-wallet] FAUCET_BOT_TOKEN env var not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const isValid = validateInitData(initData, botToken);
  if (!isValid) {
    return res.status(401).json({ error: 'initData validation failed' });
  }

  // ── 3. Parse initData and check freshness (max 1 hour old) ───────────────
  const parsed = parseInitData(initData);

  if (!checkInitDataAge(parsed, 3600)) {
    return res.status(401).json({ error: 'initData has expired — please reopen the app' });
  }

  const userId = parsed?.user?.id;
  if (!userId) {
    return res.status(400).json({ error: 'No user ID found in initData' });
  }

  // ── 4. Rate limiting — 1 request per user per 30 seconds ─────────────────
  const lastRequest = rateLimitMap.get(userId);
  const now = Date.now();
  if (lastRequest && now - lastRequest < RATE_LIMIT_MS) {
    return res.status(429).json({ error: 'Too many requests — please wait a moment' });
  }
  rateLimitMap.set(userId, now);

  // ── 5. Call TeQoin backend ───────────────────────────────────────────────
  const teqoinApi = process.env.TEQOIN_WALLET_API;
  if (!teqoinApi) {
    // API not yet configured — mini-app will silently fall back to the button
    return res.status(503).json({
      error: 'Wallet lookup not yet available',
      hint: 'Set TEQOIN_WALLET_API in Vercel env vars once the TeQoin team exposes the endpoint',
    });
  }

  try {
    const upstream = await fetch(teqoinApi, {
      method: 'GET',
      headers: {
        // Send the signed initData so TeQoin can validate on their end too
        'X-Telegram-Init-Data': initData,
        'X-Telegram-User-Id': String(userId),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5-second timeout
    });

    if (!upstream.ok) {
      console.error(`[get-wallet] TeQoin API returned ${upstream.status} for user ${userId}`);
      return res.status(502).json({ error: 'Wallet service unavailable' });
    }

    const data = await upstream.json();
    // Accept any of these response shapes from TeQoin
    const wallet =
      data?.wallet ?? data?.address ?? data?.walletAddress ?? data?.data?.wallet ?? null;

    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return res.status(404).json({ error: 'Wallet not found for this account' });
    }

    console.log(`[get-wallet] Resolved wallet for user ${userId}: ${wallet.slice(0, 8)}...`);
    return res.status(200).json({ wallet });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[get-wallet] Upstream error for user ${userId}:`, message);
    return res.status(502).json({ error: 'Wallet lookup failed — try again later' });
  }
}
