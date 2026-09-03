import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    proxy: {
      '/api': process.env.DUKAT_API_ORIGIN ?? 'http://localhost:9999',
    },
  },
  build: {
    assetsInlineLimit: (filePath) =>
      filePath.endsWith('.woff2') ? false : undefined,
  },
})
