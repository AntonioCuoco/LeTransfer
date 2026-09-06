/**
 * Piani, limiti e prezzi — la fonte unica lato client (roadmap E3/F3).
 *
 * ⚠️ QUESTO FILE È UNO SPECCHIO, NON LA VERITÀ.
 * I limiti veri li applica il server (`middleware/plan.js` → `loadPlan`, enforcement su
 * `POST /api/upload/multipart/init` e `/complete` con `413`, e clamp della retention su
 * `POST /api/shared-links` — BACKEND_API_DOCS §5-ter). Qui vivono solo per poterli
 * *mostrare* prima che l'utente ci sbatta contro.
 *
 * `GET /api/user/plan` **esiste** (vedi usePlan.ts) ed è la fonte autorevole: questi valori
 * sono il fallback finché quella risposta non arriva, e servono a mostrare i piani a chi non
 * ha ancora un account. Rispecchiano i default dichiarati in `config/constants.js`, che in
 * produzione non sono sovrascritti da nessuna env (verificato il 2026-09-06):
 *   PLAN_FREE_MAX_FILE_GB=2       PLAN_PRO_MAX_FILE_GB=20
 *   PLAN_FREE_MAX_EXPIRY_HOURS=168  PLAN_PRO_MAX_EXPIRY_HOURS=720
 *   PLAN_FREE_MAX_STORED_GB=10    PLAN_PRO_MAX_STORED_GB=200
 *   PLAN_FREE_MAX_MONTHLY_GB=10   PLAN_PRO_MAX_MONTHLY_GB=200
 * Se qualcuno cambia quelle env senza toccare questo file, la UI mente. È il motivo per
 * cui il controllo lato client è **avvisi**, mai l'ultima parola: chi decide è il `413`.
 *
 * ⚠️ I numeri di `business` qui sotto **non** rispecchiano il backend (600 GB lì, 1000 qui).
 * Non è un difetto da correggere adesso: il piano è fuori listino (`PLAN_ORDER`), non
 * comprabile e non mostrato, e quando tornerà il prezzo e i limiti andranno rifatti insieme
 * alle funzionalità da team. Allineare due segnaposto darebbe solo l'impressione che siano
 * decisi.
 */

export type PlanId = 'free' | 'pro' | 'business'

/** Base decimale, coerente con il formattatore già in uso nell'app (1 GB = 1e9 byte). */
const GB = 1e9

export interface PlanLimits {
  /** Dimensione massima del singolo trasferimento, in byte. */
  maxFileBytes: number
  /** Durata massima di un link, in ore. */
  maxExpiryHours: number
  /**
   * Quota archiviata: quanto si può tenere **contemporaneamente**. Raggiunta, non si carica
   * più finché l'utente non libera — nessun file viene mai cancellato in automatico.
   */
  maxStoredBytes: number
  /**
   * Tetto mensile: quanto può **transitare** in un mese. Serve accanto alla quota, non al
   * posto suo: chi carica → condivide → cancella → ricarica non supera mai la quota, ma
   * senza questo farebbe passare volume illimitato.
   */
  maxMonthlyBytes: number
}

export interface PlanCatalogEntry {
  id: PlanId
  name: string
  tagline: string
  /** Prezzo mensile in euro. `null` = non a listino (si passa dal contatto). */
  monthlyEur: number | null
  limits: PlanLimits
  features: string[]
  featured?: boolean
}

/**
 * ⚠️ Il checkout è ancora chiuso, ma **non più perché i prezzi sono provvisori**.
 *
 * I prezzi sono stati decisi il 2026-09-03 (Free €0, Pro €9) e i numeri qui sotto sono
 * definitivi. Questo flag resta `true` per un motivo diverso: **i prodotti su Stripe non
 * esistono ancora**. Gli endpoint backend ci sono (`/api/billing/checkout|portal|webhook`),
 * quindi senza questo gate il pulsante partirebbe davvero e fallirebbe contro un prezzo
 * inesistente — un errore molto peggio di un pulsante spento.
 *
 * Si mette a `false` quando i prodotti e i price ID su Stripe sono creati e collegati.
 */
export const PLAN_PRICES_PROVISIONAL = true

export const PLAN_CATALOG: Record<PlanId, PlanCatalogEntry> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Per mandare qualcosa, adesso.',
    monthlyEur: 0,
    limits: {
      maxFileBytes: 2 * GB,
      maxExpiryHours: 168,
      maxStoredBytes: 10 * GB,
      maxMonthlyBytes: 10 * GB,
    },
    features: [
      'Invio senza account',
      'Cifratura end-to-end',
      'Password e max download',
      'Revoca del link',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Per chi manda file di lavoro tutti i giorni.',
    monthlyEur: 9,
    limits: {
      maxFileBytes: 20 * GB,
      maxExpiryHours: 720,
      maxStoredBytes: 200 * GB,
      maxMonthlyBytes: 200 * GB,
    },
    features: [
      'Tutto di Free',
      'Storico e gestione dei link',
      'Notifiche al download',
      'Condivisione tra utenti (RSA-4096)',
    ],
    featured: true,
  },
  /**
   * ⚠️ **Non a listino** — vedi `PLAN_ORDER`, che non lo include.
   *
   * Rimandato deliberatamente il 2026-09-03: senza team, SSO e audit log (roadmap O4.3),
   * "Business" sarebbe solo "Pro con più spazio", cioè un piano senza un compratore chiaro.
   * La voce resta qui perché il backend conosce ancora il piano `business` e i suoi limiti:
   * togliere il tipo farebbe rumore ovunque per nulla, e quando i team arriveranno basterà
   * rimetterlo in `PLAN_ORDER`.
   *
   * I numeri sotto sono **segnaposto**: il prezzo andrà rifatto insieme alle funzionalità
   * da team, non ereditato da qui.
   */
  business: {
    id: 'business',
    name: 'Business',
    tagline: 'Per team che scambiano materiale pesante.',
    monthlyEur: null,
    limits: {
      maxFileBytes: 100 * GB,
      maxExpiryHours: 8760,
      maxStoredBytes: 1000 * GB,
      maxMonthlyBytes: 1000 * GB,
    },
    features: [
      'Tutto di Pro',
      'Più utenti sotto un’unica fatturazione',
      'Verifica del fingerprint del destinatario',
      'Supporto prioritario',
    ],
  },
}

/**
 * L'ordine in cui i piani si presentano e si confrontano — **solo quelli a listino**.
 * `business` è fuori di proposito (vedi il catalogo): finché non ci sono i team non va né
 * mostrato né proposto come upgrade.
 */
export const PLAN_ORDER: PlanId[] = ['free', 'pro']

/** Il piano successivo, o `null` se si è già in cima. Serve ai prompt di upgrade. */
export function nextPlanAfter(plan: PlanId): PlanId | null {
  const i = PLAN_ORDER.indexOf(plan)
  return i >= 0 && i < PLAN_ORDER.length - 1 ? PLAN_ORDER[i + 1] : null
}

/**
 * Il piano più economico che accetta un file di questa dimensione, se esiste.
 * È ciò che permette di dire "ti servirebbe Pro" invece del generico "passa a un piano superiore".
 */
export function smallestPlanFor(bytes: number): PlanId | null {
  return PLAN_ORDER.find((id) => PLAN_CATALOG[id].limits.maxFileBytes >= bytes) ?? null
}

/** Byte → stringa leggibile, base decimale come il resto dell'app. */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) {
    const gb = bytes / GB
    // 2 GB, non 2.0 GB; ma 1.5 GB resta 1.5.
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
  }
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`
  return `${bytes} B`
}

/** Ore → durata leggibile ("7 giorni", "1 anno"). */
export function formatRetention(hours: number): string {
  if (hours >= 8760) return '1 anno'
  const days = Math.round(hours / 24)
  if (days >= 30 && days % 30 === 0) {
    const months = days / 30
    return months === 1 ? '1 mese' : `${months} mesi`
  }
  return days === 1 ? '1 giorno' : `${days} giorni`
}
