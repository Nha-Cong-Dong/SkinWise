import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// The public address, for absolute links in index.html (link previews need an absolute og:image).
// Empty in dev and when unset: the link is then relative, which some apps cannot preview.
const siteUrl = (process.env.SITE_URL ?? '').replace(/\/+$/, '')

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl) },
  ],
  server: {
    // Dev only: forward /api/* to the FastAPI backend so the browser needs no CORS.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
        // Send X-Forwarded-For so the backend's per-IP limits see the browser, not this proxy.
        xfwd: true,
      },
    },
  },
})
