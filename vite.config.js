import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // reachable via LAN/ngrok while testing inside Telegram
    // `vite` alone doesn't run Vercel's /api functions. For local development,
    // proxy claim requests straight to TeQoin (dev-server → API is
    // server-to-server, so CORS doesn't apply). In production the request is
    // served by /api/claim.js instead — this proxy never runs there.
    // NOTE: `vercel dev` is closer to production (it runs /api/claim.js with
    // IP forwarding + validation); prefer it when testing claim behavior.
    proxy: {
      '/api/claim': {
        target: 'https://api2.teqoin.io',
        changeOrigin: true,
        rewrite: () => '/api/v1/Faucet/Claim',
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
