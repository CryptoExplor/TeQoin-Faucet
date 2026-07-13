import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // reachable via LAN/ngrok while testing inside Telegram
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
