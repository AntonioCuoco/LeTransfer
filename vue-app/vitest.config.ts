import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Configurazione di test separata da vite.config.ts di proposito.
 *
 * I test coprono il **nucleo crittografico** (`src/crypto/`), il **codificatore QR**
 * (`utils/qr.ts`), il **progresso per-file** (`utils/transferProgress.ts`) e la
 * **ricostruzione dei link** (`composables/useShareLink.ts`): codice che per costruzione
 * non dipende da Vue, dal DOM o dalla rete — non serve quindi la pipeline Vue/Tailwind,
 * e girare in ambiente `node` li rende veloci e senza impalcature.
 *
 * È anche il criterio per decidere cosa merita un test qui: **la logica che, se sbaglia,
 * sbaglia in silenzio**. Un QR storto sembra un QR; una barra sfasata sembra una barra;
 * un link senza chiave sembra un link — e fallisce a casa di qualcun altro, giorni dopo.
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
