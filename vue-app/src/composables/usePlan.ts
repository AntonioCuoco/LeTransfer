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
  /** true → l'utente ha un cliente Stripe: si può mostrare «Gestisci abbonamento». */
  hasBilling?: boolean
}

/** Quanto è stato usato. `tracked: false` = il conteggio non è leggibile ora. */
export interface PlanUsage {
  storedBytes: number
  monthlyBytes: number
  /** ISO: quando riparte il conteggio mensile. */
  monthlyResetsAt: string | null
  /**
   * ⚠️ `false` significa **non lo sappiamo**, non «zero».
   * Disegnare una barra vuota direbbe all'utente «hai tutto libero», che è la bugia
   * peggiore proprio nel momento in cui potrebbe essere pieno.
   */
  tracked: boolean
}

/**
 * La forma **reale** della risposta del backend.
 *
 * ⚠️ Qui c'era un difetto silenzioso: il client leggeva `data.plan`, `limits.maxFileBytes`
 * e `subscription`, mentre il server manda tutto dentro `data` e usa altri nomi
 * (`maxFileSizeBytes`, `billing`). Nessuna eccezione, nessun errore in console — solo un
 * utente Pro trattato come Free, con `isAuthoritative` a `true` a dichiarare che il dato
 * era certo. Un ripiego che si spaccia per verità è peggio di un ripiego dichiarato.
 */
interface PlanResponse {
  data?: {
    plan?: PlanId
    limits?: {
      maxFileSizeBytes?: number | null
      maxExpiryHours?: number | null
      maxStoredBytes?: number | null
      maxMonthlyBytes?: number | null
    }
    usage?: Partial<PlanUsage>
    billing?: { status?: SubscriptionInfo['status'] | null; hasBilling?: boolean }
  }
}

// Stato condiviso a livello di modulo: il piano è uno solo per sessione, e la dashboard
// lo chiede da più punti (impostazioni, prompt di upgrade, badge). Una fetch sola.
const plan = ref<PlanId>('free')
const limits = ref<PlanLimits>({ ...PLAN_CATALOG.free.limits })
const subscription = ref<SubscriptionInfo | null>(null)
const usage = ref<PlanUsage | null>(null)
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

    const body = data?.data
    const resolved: PlanId = isPlanId(body?.plan) ? body.plan : 'free'
    const fallback = PLAN_CATALOG[resolved].limits

    plan.value = resolved
    limits.value = {
      // I limiti del server vincono; il catalogo copre solo ciò che non manda.
      // `?? ` e non `|| `: uno `0` dal server è un limite vero, non un campo assente.
      maxFileBytes: body?.limits?.maxFileSizeBytes ?? fallback.maxFileBytes,
      maxExpiryHours: body?.limits?.maxExpiryHours ?? fallback.maxExpiryHours,
      maxStoredBytes: body?.limits?.maxStoredBytes ?? fallback.maxStoredBytes,
      maxMonthlyBytes: body?.limits?.maxMonthlyBytes ?? fallback.maxMonthlyBytes,
    }

    usage.value = body?.usage
      ? {
          storedBytes: body.usage.storedBytes ?? 0,
          monthlyBytes: body.usage.monthlyBytes ?? 0,
          monthlyResetsAt: body.usage.monthlyResetsAt ?? null,
          tracked: body.usage.tracked ?? false,
        }
      : null

    subscription.value = body?.billing
      ? { status: body.billing.status ?? 'none', hasBilling: body.billing.hasBilling }
      : null

    // Autorevole solo se il server ha davvero detto qualcosa. Una risposta vuota o di
    // forma inattesa è un ripiego, e va dichiarata come tale.
    isAuthoritative.value = !!body?.plan
  } catch {
    // Endpoint assente, sessione scaduta o rete giù: si resta su Free.
    // Non è un errore da mostrare — è lo stato reale di chiunque oggi.
    plan.value = 'free'
    limits.value = { ...PLAN_CATALOG.free.limits }
    subscription.value = null
    usage.value = null
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

  /** Spazio ancora libero, o `null` se il conteggio non è noto. */
  const storedRemaining = computed(() =>
    usage.value?.tracked ? Math.max(0, limits.value.maxStoredBytes - usage.value.storedBytes) : null,
  )

  /** Volume ancora disponibile questo mese, o `null` se il conteggio non è noto. */
  const monthlyRemaining = computed(() =>
    usage.value?.tracked ? Math.max(0, limits.value.maxMonthlyBytes - usage.value.monthlyBytes) : null,
  )

  const storedPercent = computed(() =>
    usage.value?.tracked && limits.value.maxStoredBytes > 0
      ? Math.min(100, Math.round((usage.value.storedBytes / limits.value.maxStoredBytes) * 100))
      : null,
  )

  const monthlyPercent = computed(() =>
    usage.value?.tracked && limits.value.maxMonthlyBytes > 0
      ? Math.min(100, Math.round((usage.value.monthlyBytes / limits.value.maxMonthlyBytes) * 100))
      : null,
  )

  /**
   * Il motivo per cui un file di questa dimensione **non passerebbe**, o `null` se passa.
   *
   * È la versione preventiva dei tre `413`: la stessa domanda che il server farà, fatta
   * prima di far aspettare l'utente. Il server resta l'autorità — qui si evita solo di
   * scoprire il limite a upload iniziato.
   *
   * ⚠️ Restituisce `null` anche quando il conteggio non è noto (`tracked: false`): senza
   * dati non si blocca nulla, si lascia decidere al server.
   */
  function blockingLimitFor(bytes: number): 'file' | 'quota' | 'monthly' | null {
    if (exceedsFileLimit(bytes)) return 'file'
    const stored = storedRemaining.value
    if (stored !== null && bytes > stored) return 'quota'
    const monthly = monthlyRemaining.value
    if (monthly !== null && bytes > monthly) return 'monthly'
    return null
  }

  return {
    plan: readonly(plan),
    limits: readonly(limits),
    usage: readonly(usage),
    subscription: readonly(subscription),
    isAuthoritative: readonly(isAuthoritative),
    isLoading: readonly(isLoading),
    entry,
    isPaid,
    storedRemaining,
    monthlyRemaining,
    storedPercent,
    monthlyPercent,
    load,
    exceedsFileLimit,
    blockingLimitFor,
  }
}
