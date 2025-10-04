import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import UnoCSS from 'unocss/vite';

const repoName =
  process.env.GITHUB_REPOSITORY?.split('/')[1] || ''

export default defineConfig({
  // Append suffix for github pages deploy if CI
  base: repoName ? `/${repoName}/` : '/',
  plugins: [svelte(), UnoCSS()],
  server: {
    host: '0.0.0.0',
    port: 3000
  }
})
