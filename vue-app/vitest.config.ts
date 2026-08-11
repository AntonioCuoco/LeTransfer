import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

/**
 * Configurazione di test separata da vite.config.ts di proposito, e divisa in **due
 * progetti** perché le due famiglie di test hanno bisogni opposti.
 *
 * **`logica`** (`*.test.ts`, ambiente `node`) — nucleo crittografico (`src/crypto/`),
 * codificatore QR, progresso per-file, controllo pre-invio, ricostruzione dei link,
 * orchestrazione dell'invio guest. È codice che per costruzione non dipende da Vue né
 * dal DOM: girarlo in `node`, senza impalcature, lo rende veloce e onesto — si testa il
 * codice vero, non un rimpiazzo. Node 22 espone nativamente Web Crypto, Blob e
 * ReadableStream, cioè le stesse primitive del browser.
 *
 * **`componenti`** (`*.spec.ts`, ambiente `happy-dom`) — la macchina a stati delle
 * schermate: cosa si vede, cosa è disabilitato, cosa parte al click. Qui serve un DOM,
 * ma non serve un browser vero.
 *
 * Il criterio per decidere se una cosa merita un test: **se sbaglia, sbaglia in
 * silenzio**. Un QR storto sembra un QR; una barra sfasata sembra una barra; un link
 * senza chiave sembra un link — e fallisce a casa di qualcun altro, giorni dopo.
 *
 * Il percorso critico completo (cifra → carica → link → decifra) sta invece in
 * `e2e/`, con Playwright: è l'unico punto in cui servono un browser e i suoi stream veri.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
  test: {
    projects: [
      {
        resolve: { alias: { '@': path.resolve(__dirname, './') } },
        test: {
          name: 'logica',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        plugins: [vue()],
        resolve: { alias: { '@': path.resolve(__dirname, './') } },
        test: {
          name: 'componenti',
          environment: 'happy-dom',
          include: ['src/**/*.spec.ts'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
})
