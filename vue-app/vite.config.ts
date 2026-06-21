import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
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
          'ant-design': ['ant-design-vue', '@ant-design/icons-vue'],
          vendor: ['vue', 'vue-router', 'pinia', '@tanstack/vue-query'],
          crypto: ['crypto-js'],
        },
      },
    },
  },
})
