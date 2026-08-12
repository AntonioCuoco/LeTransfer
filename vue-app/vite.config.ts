import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import Components from 'unplugin-vue-components/vite'
import { PrimeVueResolver } from '@primevue/auto-import-resolver'
import path from 'path'

// Origini da cui l'app può incorporare la stanza del captcha.
// ⚠️ Da tenere allineata a ALLOWED_PARENTS in public/captcha.html, che è il gate
// vero: questa lista decide chi può *mostrare* l'iframe, quella chi può *ricevere*
// il token. Se aggiungi un'origine di sviluppo (es. l'IP della LAN), va messa in
// entrambe, e in produzione va lasciata la sola origine reale del frontend.
const CAPTCHA_PARENTS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

// Security headers del DEV server, applicati **per path**.
//
// Perché non `server.headers`: quello è globale, e `X-Frame-Options: DENY` colpirebbe
// anche `public/captcha.html`, che invece DEVE poter stare in un iframe cross-origin
// (vedi src/composables/useTurnstile.ts). Con DENY il browser rifiuta di renderizzare
// il frame e mostra "ha rifiutato la connessione" dentro il riquadro — un messaggio
// che sembra un problema di rete e non lo è.
//
// La CSP *autoritativa* NON va qui: una CSP stretta romperebbe l'HMR di Vite (usa eval
// + ws). Va impostata in PROD sull'host/CDN che serve il build — vedi
// docs/SECURITY_IMPROVEMENTS.md #3. In prod l'origine del captcha ha bisogno dello
// stesso trattamento: `frame-ancestors <frontend>`, non `'none'`.
function devSecurityHeaders(): Plugin {
  return {
    name: 'letransfer-dev-security-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

        const path = (req.url ?? '').split('?')[0]
        if (path.endsWith('/captcha.html')) {
          // `frame-ancestors` è l'equivalente di XFO ma con una lista di origini.
          // Niente `X-Frame-Options` su questo path: DENY non ammette eccezioni.
          res.setHeader('Content-Security-Policy', `frame-ancestors ${CAPTCHA_PARENTS.join(' ')}`)
        } else {
          res.setHeader('X-Frame-Options', 'DENY')
        }
        next()
      })
    },
  }
}

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
    devSecurityHeaders(),
  ],
  server: {
    // `true` = ascolta anche sull'IP della LAN, non solo su localhost. Serve perché
    // l'origine isolata del captcha in sviluppo è un secondo indirizzo dello stesso
    // dev server (vedi VITE_CAPTCHA_ORIGIN in .env).
    host: true,
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
