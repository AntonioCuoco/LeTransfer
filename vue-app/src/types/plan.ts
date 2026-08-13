/**
 * Piani, limiti e prezzi — la fonte unica lato client (roadmap E3/F3).
 *
 * ⚠️ QUESTO FILE È UNO SPECCHIO, NON LA VERITÀ.
 * I limiti veri li applica il server (`middleware/plan.js` → `loadPlan`, enforcement su
 * `POST /api/upload/multipart/init` e `/complete` con `413`, e clamp della retention su
 * `POST /api/shared-links` — BACKEND_API_DOCS §5-ter). Qui vivono solo per poterli
 * *mostrare* prima che l'utente ci sbatta contro.
 *
 * Finché non esiste `GET /api/user/plan` (vedi usePlan.ts) questi valori sono anche il
 * fallback. Sono i default dichiarati dalle env del backend:
 *   PLAN_FREE_MAX_FILE_GB=2   PLAN_PRO_MAX_FILE_GB=20   PLAN_BUSINESS_MAX_FILE_GB=100
 *   PLAN_FREE_MAX_EXPIRY_HOURS=168   PLAN_PRO_MAX_EXPIRY_HOURS=720
 *   ABSOLUTE_MAX_EXPIRY_HOURS=8760 (ceiling, vale per Business)
 * Se qualcuno cambia quelle env senza toccare questo file, la UI mente. È il motivo per
 * cui il controllo lato client è **avvisi**, mai l'ultima parola: chi decide è il `413`.
 */

export type PlanId = 'free' | 'pro' | 'business'

/** Base decimale, coerente con il formattatore già in uso nell'app (1 GB = 1e9 byte). */
const GB = 1e9

export interface PlanLimits {
  /** Dimensione massima del singolo trasferimento, in byte. */
  maxFileBytes: number
  /** Durata massima di un link, in ore. */
  maxExpiryHours: number
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
 * ⚠️ PREZZI SEGNAPOSTO — da decidere prima della messa in vendita.
 * Finché questo è `true` la UI lo dichiara apertamente e il checkout resta chiuso:
 * meglio un percorso d'acquisto spento che uno che incassa la cifra sbagliata.
 */
export const PLAN_PRICES_PROVISIONAL = true

export const PLAN_CATALOG: Record<PlanId, PlanCatalogEntry> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Per mandare qualcosa, adesso.',
    monthlyEur: 0,
    limits: { maxFileBytes: 2 * GB, maxExpiryHours: 168 },
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
    monthlyEur: 4,
    limits: { maxFileBytes: 20 * GB, maxExpiryHours: 720 },
    features: [
      'Tutto di Free',
      'Storico e gestione dei link',
      'Notifiche al download',
      'Condivisione tra utenti (RSA-4096)',
    ],
    featured: true,
  },
  business: {
    id: 'business',
    name: 'Business',
    tagline: 'Per team che scambiano materiale pesante.',
    monthlyEur: 12,
    limits: { maxFileBytes: 100 * GB, maxExpiryHours: 8760 },
    features: [
      'Tutto di Pro',
      'Più utenti sotto un’unica fatturazione',
      'Verifica del fingerprint del destinatario',
      'Supporto prioritario',
    ],
  },
}

/** L'ordine in cui i piani si presentano e si confrontano. */
export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'business']

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
