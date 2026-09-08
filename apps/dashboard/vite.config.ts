import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

const proxy = {
  '/api': process.env.DUKAT_API_ORIGIN ?? 'http://localhost:9999',
  '/profile-images': process.env.DUKAT_API_ORIGIN ?? 'http://localhost:9999',
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    proxy,
  },
  preview: {
    proxy,
  },
  build: {
    assetsInlineLimit: (filePath) =>
      filePath.endsWith('.woff2') ? false : undefined,
  },
})
