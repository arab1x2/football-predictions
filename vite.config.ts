import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // During `npm run dev`, API calls go to a local `wrangler pages dev` on port 8788.
    proxy: { '/api': 'http://localhost:8788' },
  },
});
