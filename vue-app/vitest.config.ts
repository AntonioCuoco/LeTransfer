import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Configurazione di test separata da vite.config.ts di proposito.
 *
 * I test coprono il **nucleo crittografico** (`src/crypto/`) e il **codificatore QR**
 * (`utils/qr.ts`): codice che per costruzione non dipende da Vue, dagli store, dalla
 * rete o dal DOM — non serve quindi la pipeline Vue/Tailwind, e girare in ambiente
 * `node` li rende veloci e senza impalcature. È anche il criterio per decidere cosa
 * merita un test qui: la logica pura che, se sbaglia, sbaglia in silenzio.
 *
 * Node 22 espone nativamente Web Crypto, Blob e ReadableStream: le stesse primitive
 * che usa il browser, quindi si testa il codice vero, non un rimpiazzo.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
