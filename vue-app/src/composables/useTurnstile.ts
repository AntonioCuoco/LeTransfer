import { ref, onBeforeUnmount } from 'vue'

/**
 * Cloudflare Turnstile per l'invio senza account.
 *
 * - **Env-gated**: se `VITE_TURNSTILE_SITE_KEY` non è impostata, tutto è no-op
 *   (`getToken()` → undefined): dev fail-open, coerente col backend.
 * - `mount(el)` carica lo script e renderizza il widget nel container.
 * - `getToken()` restituisce un token fresco (attende il callback del widget).
 * - `refresh()` — il token è **monouso**: dopo un invio ne prepara uno nuovo.
 *
 * Contratto backend: BACKEND_API_DOCS.md §4.9 — se `TURNSTILE_SECRET` è impostata,
 * `POST /api/guest/upload/init` richiede un `turnstileToken` valido.
 */

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
  getResponse: (widgetId?: string) => string | undefined
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Impossibile caricare Turnstile'))
    document.head.appendChild(script)
  })

  return scriptPromise
}

export function useTurnstile() {
  const enabled = !!SITE_KEY
  const token = ref<string | null>(null)
  // Il widget non potrà produrre un token (script bloccato, hostname non autorizzato → 401,
  // sitekey errata). Serve a NON far aspettare l'utente per tutto il timeout di getToken().
  const failed = ref(false)
  let widgetId: string | null = null

  async function mount(container: HTMLElement | null) {
    if (!enabled || !container) return

    try {
      await loadTurnstileScript()
    } catch {
      // Script non caricato (rete/CSP): l'upload andrà in errore captcha, gestito a valle.
      failed.value = true
      return
    }
    if (!window.turnstile) {
      failed.value = true
      return
    }

    widgetId = window.turnstile.render(container, {
      sitekey: SITE_KEY,
      callback: (value: string) => { token.value = value; failed.value = false },
      'error-callback': () => { token.value = null; failed.value = true },
      'expired-callback': () => { token.value = null },
      'timeout-callback': () => { token.value = null; failed.value = true },
    })
  }

  async function getToken(timeoutMs = 8000): Promise<string | undefined> {
    if (!enabled) return undefined
    if (token.value) return token.value
    // Widget già in errore: inutile attendere, il token non arriverà mai.
    if (failed.value) return undefined

    // Il widget managed emette il token poco dopo il render: aspettalo un attimo.
    const start = Date.now()
    return new Promise<string | undefined>((resolve) => {
      const check = () => {
        if (token.value) {
          resolve(token.value)
          return
        }
        if (failed.value || Date.now() - start > timeoutMs) {
          resolve(undefined)
          return
        }
        window.setTimeout(check, 150)
      }
      check()
    })
  }

  function refresh() {
    token.value = null
    if (enabled && window.turnstile && widgetId) {
      try {
        window.turnstile.reset(widgetId)
      } catch {
        // ignora
      }
    }
  }

  onBeforeUnmount(() => {
    if (window.turnstile && widgetId) {
      try {
        window.turnstile.remove(widgetId)
      } catch {
        // ignora
      }
    }
  })

  return { enabled, token, failed, mount, getToken, refresh }
}
