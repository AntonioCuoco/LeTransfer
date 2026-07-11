import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import Components from 'unplugin-vue-components/vite'
import { PrimeVueResolver } from '@primevue/auto-import-resolver'
import path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // Auto-import PrimeVue components (no per-file import needed). Generates
    // components.d.ts for type-safety. Resolver-based: no native binaries.
    Components({
      resolvers: [PrimeVueResolver()],
      dts: 'components.d.ts',
    }),
  ],
  // Security headers per il DEV server. Questi tre sono sempre sicuri (non rompono l'HMR).
  // La CSP *autoritativa* NON va qui: una CSP stretta romperebbe l'HMR di Vite (usa eval + ws).
  // Va impostata in PROD sull'host/CDN che serve il build — CSP completa in
  // docs/SECURITY_IMPROVEMENTS.md #3 (binario PROD/Infra).
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          primevue: ['primevue', '@primeuix/themes'],
          vendor: ['vue', 'vue-router', 'pinia', '@tanstack/vue-query'],
        },
      },
    },
  },
})
