import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end del **percorso critico**: cifra → carica → link → decifra.
 *
 * Perché serve un browser vero e non basta happy-dom: qui girano Web Crypto, gli stream
 * e le `Blob.slice` per davvero. Sono esattamente i pezzi su cui poggia la promessa del
 * prodotto, e sono anche quelli che un DOM simulato finge invece di eseguire.
 *
 * **La rete è stubbata** (`page.route`): niente backend, niente storage, niente
 * Turnstile. I test devono poter girare su una macchina qualsiasi e in CI senza
 * infrastruttura — e ciò che vogliamo verificare qui è il **client**, non il server.
 * Il contratto con gli endpoint reali è documentato in BACKEND_API_DOCS §4.9 e coperto
 * dai test unitari dello store.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  /**
   * Si testa il **build di produzione**, non il dev server: è quello che riceve
   * l'utente, con lo stesso codice minificato e gli stessi chunk. Un errore che appare
   * solo dopo il bundling (un import dinamico che non si risolve, un font che non viene
   * emesso) qui si vede, in `vite dev` no.
   */
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
