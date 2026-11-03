import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import Components from 'unplugin-vue-components/vite'
import { PrimeVueResolver } from '@primevue/auto-import-resolver'
import path from 'path'
import fs from 'fs'

// Origini da cui l'app può incorporare la stanza del captcha, **in sviluppo**.
//
// ⚠️ Da tenere allineata a ALLOWED_PARENTS in public/captcha.html, che è il gate vero:
// questa lista decide chi può *mostrare* l'iframe, quella chi può *ricevere* il token.
// Se aggiungi un'origine di sviluppo (es. l'IP della LAN), va messa in entrambe.
//
// In produzione questa costante non conta — il dev server non gira — ma l'host/CDN deve
// servire `captcha.html` con `frame-ancestors https://novren.net https://www.novren.net
// https://novren.it https://www.novren.it`, cioè gli stessi domini ufficiali che stanno
// in ALLOWED_PARENTS. Vedi BACKEND_HANDOFF voce 8.
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

// CSP dello **staging**, ricavata da quella di produzione.
//
// `public/_headers` è scritto per la produzione: `connect-src` ammette `api.novren.net`,
// `frame-src` solo `captcha.novren.net`, e la pagina del captcha si lascia incorniciare solo
// da `novren.net`. Copiato tale e quale su novren-staging.pages.dev, il browser blocca ogni
// chiamata all'API di staging e l'iframe del captcha (verificato il 2026-11-03).
//
// Con `--mode staging` questo plugin riscrive `dist/_headers` dopo il build, con i valori di
// `.env.staging`. Con qualsiasi altro mode non fa nulla: il build di produzione resta identico
// byte per byte, e la build riproducibile non cambia.
// Se una sostituzione non trova il testo atteso il build **fallisce**: meglio un errore qui
// che una CSP di staging che punta in silenzio alla produzione.
function stagingHeaders(env: Record<string, string>): Plugin {
  let outDir = 'dist'
  return {
    name: 'novren-staging-headers',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const apiOrigin = new URL(env.VITE_API_URL).origin
      const frontendOrigin = new URL(env.VITE_FRONTEND_URL).origin
      // Senza VITE_CAPTCHA_ORIGIN il captcha gira sulla stessa origine dell'app (useTurnstile.ts).
      const captchaSource = env.VITE_CAPTCHA_ORIGIN ? new URL(env.VITE_CAPTCHA_ORIGIN).origin : "'self'"

      const file = path.join(outDir, '_headers')
      let text = fs.readFileSync(file, 'utf8')
      const sostituzioni: Array<[string, string]> = [
        ['https://api.novren.net', apiOrigin],
        ['frame-src https://captcha.novren.net', `frame-src ${captchaSource}`],
        ['frame-ancestors https://novren.net', `frame-ancestors ${frontendOrigin}`],
      ]
      for (const [da, a] of sostituzioni) {
        if (!text.includes(da)) {
          throw new Error(`[novren-staging-headers] "${da}" non trovato in _headers: aggiorna vite.config.ts`)
        }
        text = text.split(da).join(a)
      }
      fs.writeFileSync(file, text)
    },
  }
}

export default defineConfig(({ mode }) => ({
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
    ...(mode === 'staging' ? [stagingHeaders(loadEnv(mode, __dirname, 'VITE_'))] : []),
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
}))
