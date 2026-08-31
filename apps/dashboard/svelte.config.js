import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { URL } from 'node:url'

const profileImageOrigin = process.env.PROFILE_IMAGE_PUBLIC_BASE_URL
  ? new URL(process.env.PROFILE_IMAGE_PUBLIC_BASE_URL).origin
  : undefined

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: 'index.html' }),
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['self'],
        'base-uri': ['self'],
        'connect-src': ['self'],
        'font-src': ['self'],
        'form-action': ['self'],
        'img-src': [
          'self',
          'data:',
          'blob:',
          ...(profileImageOrigin ? [profileImageOrigin] : []),
        ],
        'object-src': ['none'],
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline'],
      },
    },
  },
}

export default config
