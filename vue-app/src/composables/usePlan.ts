import { ref, computed, readonly } from 'vue'
import axios from 'axios'
import {
  PLAN_CATALOG,
  type PlanId,
  type PlanLimits,
} from '@/src/types/plan'

/**
 * Il piano dell'utente e i suoi limiti (roadmap E3/F3).
 *
 * **Il problema che risolve.** Il backend conosce il piano — `loadPlan` popola
 * `req.plan`/`req.planLimits` e li usa per rifiutare gli upload fuori misura — ma **non
 * lo dice a nessuno**: non esiste un endpoint che lo restituisca. Il risultato è che
 * l'utente scopre il proprio limite solo sbattendoci contro, a upload iniziato.
 *
 * **Come lo risolve, oggi.** Chiede `GET /api/user/plan`. Se l'endpoint non c'è ancora
 * (404/501) ricade su `free` con i limiti del catalogo — che **è la risposta giusta oggi**,
 * perché senza `SUBSCRIPTIONS_TABLE` il backend fa esattamente lo stesso fail-open. La UI
 * quindi funziona da subito e diventa più precisa da sola quando l'endpoint arriverà.
 *
 * `isAuthoritative` distingue i due casi: serve a non affermare con sicurezza qualcosa che
 * abbiamo dedotto. Dove il piano conta davvero, la UI lo dichiara.
 *
 * ── Contratto atteso dal backend ────────────────────────────────────────────────
 *   GET /api/user/plan        (autenticata)
 *   200 → { plan: 'free'|'pro'|'business',
 *           limits?: { maxFileBytes: number, maxExpiryHours: number },
 *           subscription?: { status, currentPeriodEnd?, cancelAtPeriodEnd? } }
 * `limits` è opzionale: se manca si usano quelli del catalogo per quel piano.
 * ────────────────────────────────────────────────────────────────────────────────
 */

export interface SubscriptionInfo {
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none'
  /** ISO date: fine del periodo pagato. */
  currentPeriodEnd?: string
  /** true = resta attivo fino a fine periodo, poi torna a Free. */
  cancelAtPeriodEnd?: boolean
}

interface PlanResponse {
  plan?: PlanId
  limits?: Partial<PlanLimits>
  subscription?: SubscriptionInfo
}

// Stato condiviso a livello di modulo: il piano è uno solo per sessione, e la dashboard
// lo chiede da più punti (impostazioni, prompt di upgrade, badge). Una fetch sola.
const plan = ref<PlanId>('free')
const limits = ref<PlanLimits>({ ...PLAN_CATALOG.free.limits })
const subscription = ref<SubscriptionInfo | null>(null)
const isAuthoritative = ref(false)
const isLoading = ref(false)
let inFlight: Promise<void> | null = null
// Un tentativo è già stato fatto in questa sessione (riuscito o no). Senza questo, un
// endpoint assente verrebbe richiamato a ogni mount di ogni componente che usa il piano:
// un 404 a ripetizione a ogni navigazione, per sapere ogni volta la stessa cosa.
let hasAttempted = false

function isPlanId(value: unknown): value is PlanId {
  return value === 'free' || value === 'pro' || value === 'business'
}

async function fetchPlan(): Promise<void> {
  isLoading.value = true
  try {
    // L'accessToken lo inietta l'interceptor axios globale.
    const { data } = await axios.get<PlanResponse>(`${import.meta.env.VITE_API_URL}/user/plan`)

    const resolved: PlanId = isPlanId(data?.plan) ? data.plan : 'free'
    plan.value = resolved
    limits.value = {
      // I limiti del server vincono; il catalogo copre i campi che non manda.
      maxFileBytes: data?.limits?.maxFileBytes ?? PLAN_CATALOG[resolved].limits.maxFileBytes,
      maxExpiryHours: data?.limits?.maxExpiryHours ?? PLAN_CATALOG[resolved].limits.maxExpiryHours,
      // Quota e tetto mensile: il backend non li manda ancora (vedi
      // BACKEND_WORKORDER_LIMITI_E_QUOTA.md §4.3), quindi oggi arrivano sempre dal catalogo.
      maxStoredBytes: data?.limits?.maxStoredBytes ?? PLAN_CATALOG[resolved].limits.maxStoredBytes,
      maxMonthlyBytes: data?.limits?.maxMonthlyBytes ?? PLAN_CATALOG[resolved].limits.maxMonthlyBytes,
    }
    subscription.value = data?.subscription ?? null
    isAuthoritative.value = true
  } catch {
    // Endpoint assente, sessione scaduta o rete giù: si resta su Free.
    // Non è un errore da mostrare — è lo stato reale di chiunque oggi.
    plan.value = 'free'
    limits.value = { ...PLAN_CATALOG.free.limits }
    subscription.value = null
    isAuthoritative.value = false
  } finally {
    isLoading.value = false
    hasAttempted = true
    inFlight = null
  }
}

export function usePlan() {
  /**
   * Carica il piano una volta sola per sessione.
   * `force` serve dopo un pagamento, dove rileggere è tutto il punto: lì si ritenta anche
   * se il tentativo precedente era fallito.
   */
  function load(force = false): Promise<void> {
    if (force) {
      inFlight = fetchPlan()
      return inFlight
    }
    if (inFlight) return inFlight
    if (hasAttempted) return Promise.resolve()
    inFlight = fetchPlan()
    return inFlight
  }

  const entry = computed(() => PLAN_CATALOG[plan.value])
  const isPaid = computed(() => plan.value !== 'free')

  /** `true` se un file di questa dimensione supera il cap del piano. Avviso, non verdetto. */
  function exceedsFileLimit(bytes: number): boolean {
    return bytes > limits.value.maxFileBytes
  }

  return {
    plan: readonly(plan),
    limits: readonly(limits),
    subscription: readonly(subscription),
    isAuthoritative: readonly(isAuthoritative),
    isLoading: readonly(isLoading),
    entry,
    isPaid,
    load,
    exceedsFileLimit,
  }
}
