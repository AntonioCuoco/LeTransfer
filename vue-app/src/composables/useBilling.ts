import { ref } from 'vue'
import axios from 'axios'
import { notify } from '@/src/utils/notify'
import { PLAN_PRICES_PROVISIONAL, type PlanId } from '@/src/types/plan'

/**
 * Checkout e gestione abbonamento (roadmap E3/F3).
 *
 * **Stato onesto.** Il backend di fatturazione **non esiste ancora**: servono la tabella
 * `Subscriptions`, la env `SUBSCRIPTIONS_TABLE` e il webhook Stripe che la scrive
 * (BACKEND_HANDOFF voce 13). Questo composable è il lato client di quel contratto, scritto
 * perché quando il backend arriva non ci sia altro da fare che accenderlo.
 *
 * **Perché non fallisce brutto.** Se l'endpoint non c'è, la chiamata va in 404 e noi
 * *non* mostriamo "errore di rete": diciamo che i pagamenti non sono ancora attivi. È la
 * verità, ed è più utile di uno stack trace travestito da messaggio.
 *
 * **Perché il checkout è chiuso comunque.** Finché `PLAN_PRICES_PROVISIONAL` è `true` i
 * prezzi sono segnaposto. Un percorso d'acquisto che incassa la cifra sbagliata è peggio
 * di un percorso d'acquisto spento, quindi il pulsante si ferma prima di partire.
 *
 * ── Contratto atteso dal backend ────────────────────────────────────────────────
 *   POST /api/billing/checkout  { plan: 'pro'|'business', interval: 'month'|'year' }
 *     200 → { url }   ← Stripe Checkout Session, ci si redirige
 *   POST /api/billing/portal    {}
 *     200 → { url }   ← Stripe Billing Portal, per cambiare piano/carta/disdire
 * Entrambe autenticate. `success_url` / `cancel_url` li costruisce il backend puntando a
 * `${FRONTEND_URL}/app/abbonamento/esito?stato=…`.
 * ────────────────────────────────────────────────────────────────────────────────
 */

export type BillingInterval = 'month' | 'year'

/** Il percorso su cui Stripe deve rimandare l'utente. Lo consuma BillingReturnPage.vue. */
export const BILLING_RETURN_PATH = '/app/abbonamento/esito'

export function useBilling() {
  const isStarting = ref(false)
  /** `true` quando il backend di fatturazione ha risposto "non esisto". */
  const isUnavailable = ref(false)

  /** I pagamenti sono utilizzabili? Se no, `reason` spiega perché, in italiano. */
  function availability(): { ready: boolean; reason?: string } {
    if (PLAN_PRICES_PROVISIONAL) {
      return {
        ready: false,
        reason: 'I prezzi non sono ancora definitivi: il pagamento si accende quando lo sono.',
      }
    }
    if (isUnavailable.value) {
      return { ready: false, reason: 'I pagamenti non sono ancora attivi su questo ambiente.' }
    }
    return { ready: true }
  }

  async function redirectTo(endpoint: string, body: Record<string, unknown>): Promise<void> {
    const { ready, reason } = availability()
    if (!ready) {
      notify.info(reason ?? 'Pagamenti non disponibili.')
      return
    }

    isStarting.value = true
    try {
      const { data } = await axios.post<{ url?: string }>(
        `${import.meta.env.VITE_API_URL}${endpoint}`,
        body,
      )
      if (!data?.url) throw new Error('missing url')
      // Redirect pieno: Stripe Checkout non vive in un iframe, e non deve.
      window.location.assign(data.url)
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      if (status === 404 || status === 501) {
        isUnavailable.value = true
        notify.info('I pagamenti non sono ancora attivi. Stiamo completando l’integrazione.')
      } else {
        notify.error('Non siamo riusciti ad aprire il pagamento. Riprova tra poco.')
      }
    } finally {
      isStarting.value = false
    }
  }

  /** Avvia l'acquisto di un piano. */
  function startCheckout(plan: Exclude<PlanId, 'free'>, interval: BillingInterval = 'month') {
    return redirectTo('/billing/checkout', { plan, interval })
  }

  /** Apre il portale Stripe per chi un abbonamento ce l'ha già. */
  function openPortal() {
    return redirectTo('/billing/portal', {})
  }

  return { isStarting, isUnavailable, availability, startCheckout, openPortal }
}
