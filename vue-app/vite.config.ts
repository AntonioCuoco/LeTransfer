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
          crypto: ['crypto-js'],
        },
      },
    },
  },
})
