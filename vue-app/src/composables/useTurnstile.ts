import { ref, onBeforeUnmount } from 'vue'

/**
 * Cloudflare Turnstile — **isolato in un iframe cross-origin**.
 *
 * Prima questo composable iniettava `challenges.cloudflare.com/api.js` direttamente
 * nella pagina. Quello script girava quindi nella NOSTRA origine, con pieno accesso
 * al DOM e alla memoria — cioè nella stessa stanza in cui `generateAESKey()` crea la
 * chiave dell'invio. Un codice di terze parti accanto al segreto: incompatibile con
 * la promessa zero-knowledge.
 *
 * Ora il widget vive in `public/captcha.html`, servito da un'origine diversa
 * (`VITE_CAPTCHA_ORIGIN`), e comunica solo per `postMessage`. Il cross-origin gli
 * nega l'accesso al documento genitore, e la pagina che cifra può stare su
 * `script-src 'self'` senza eccezioni. Vedi docs/PAGINE_CRITICHE.md.
 *
 * - **Env-gated**: senza `VITE_TURNSTILE_SITE_KEY` è tutto no-op (dev fail-open,
 *   coerente col backend che senza `TURNSTILE_SECRET` non richiede il token).
 * - `mount(el)` crea l'iframe nel contenitore.
 * - `getToken()` attende un token fresco; se il widget è in errore risponde subito.
 * - `refresh()` — il token è monouso: dopo un invio ne prepara uno nuovo.
 *
 * Contratto backend: BACKEND_API_DOCS.md §4.9.
 */

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY

// Origine della stanza isolata. Se manca, si ricade sulla propria origine: l'iframe
// funziona ma NON isola più nulla — in sviluppo basta puntare a 127.0.0.1 mentre
// l'app gira su localhost (per il browser sono due origini distinte).
const CAPTCHA_ORIGIN = import.meta.env.VITE_CAPTCHA_ORIGIN || window.location.origin

interface CaptchaMessage {
  source?: string
  type?: 'token' | 'error' | 'expired'
  token?: string | null
}

export function useTurnstile() {
  const enabled = !!SITE_KEY
  const token = ref<string | null>(null)
  // Il widget non potrà produrre un token (script bloccato, hostname non autorizzato
  // → 401, sitekey errata): serve a NON far attendere l'utente per tutto il timeout.
  const failed = ref(false)

  let frame: HTMLIFrameElement | null = null

  function frameSrc(): string {
    const params = new URLSearchParams({ sitekey: SITE_KEY ?? '', parent: window.location.origin })
    return `${CAPTCHA_ORIGIN}/captcha.html?${params.toString()}`
  }

  function onMessage(event: MessageEvent<CaptchaMessage>) {
    // Due controlli, entrambi necessari: l'origine attesa e il marcatore del mittente.
    if (event.origin !== CAPTCHA_ORIGIN) return
    if (event.data?.source !== 'letransfer-captcha') return

    if (event.data.type === 'token' && event.data.token) {
      token.value = event.data.token
      failed.value = false
    } else if (event.data.type === 'expired') {
      token.value = null
    } else if (event.data.type === 'error') {
      token.value = null
      failed.value = true
    }
  }

  function mount(container: HTMLElement | null) {
    if (!enabled || !container) return

    if (CAPTCHA_ORIGIN === window.location.origin && import.meta.env.DEV) {
      console.warn(
        '[turnstile] VITE_CAPTCHA_ORIGIN non impostata: il widget gira nella stessa origine e NON è isolato. ' +
        'In sviluppo apri l\'app su http://localhost:5173 e imposta VITE_CAPTCHA_ORIGIN=http://127.0.0.1:5173.',
      )
    }

    window.addEventListener('message', onMessage)

    frame = document.createElement('iframe')
    frame.src = frameSrc()
    frame.title = 'Verifica anti-bot'
    frame.width = '300'
    frame.height = '65'
    frame.style.border = '0'
    frame.style.colorScheme = 'normal'
    // Nessun `sandbox`: l'isolamento lo dà l'origine diversa, mentre l'origine opaca
    // introdotta da sandbox romperebbe l'accesso allo storage richiesto da Turnstile.
    frame.setAttribute('referrerpolicy', 'origin')
    container.appendChild(frame)
  }

  async function getToken(timeoutMs = 8000): Promise<string | undefined> {
    if (!enabled) return undefined
    if (token.value) return token.value
    if (failed.value) return undefined

    const start = Date.now()
    return new Promise<string | undefined>((resolve) => {
      const check = () => {
        if (token.value) return resolve(token.value)
        if (failed.value || Date.now() - start > timeoutMs) return resolve(undefined)
        window.setTimeout(check, 150)
      }
      check()
    })
  }

  function refresh() {
    token.value = null
    frame?.contentWindow?.postMessage({ type: 'reset' }, CAPTCHA_ORIGIN)
  }

  onBeforeUnmount(() => {
    window.removeEventListener('message', onMessage)
    frame?.remove()
    frame = null
  })

  return { enabled, token, failed, mount, getToken, refresh }
}
