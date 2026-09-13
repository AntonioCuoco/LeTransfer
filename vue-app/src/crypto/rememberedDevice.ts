import { idbDel, idbGet, idbSet } from './keyStore'
import { getCurrentUser } from '@/src/utils/getCurrentUser'

/**
 * «Ricorda su questo dispositivo» — la master key salvata nel browser, per non chiedere le
 * 24 parole a ogni sessione.
 *
 * ── Perché esiste ────────────────────────────────────────────────────────────────
 * La master key vive in RAM: a ogni ricarica andavano reinserite le 24 parole. Il costo non
 * è solo la scomodità — chi deve incollarle ogni giorno finisce per tenerle dove si
 * incollano in fretta, cioè nel posto meno sicuro.
 *
 * ── Il modello di sicurezza, detto per esteso ────────────────────────────────────
 * - È lo **stesso** già in uso per la chiave privata RSA (keyStore.ts): una CryptoKey nativa
 *   in IndexedDB, **non esportabile**. Uno script malevolo nella pagina può *usarla* finché
 *   la pagina è aperta, ma non *copiarla* altrove. `rememberMasterKey` rifiuta una chiave
 *   esportabile: sarebbe un'altra cosa, e peggiore.
 * - Non arriva mai al server: lo zero-knowledge resta intatto.
 * - Il rischio che resta è fisico: chi usa questo browser con l'account aperto apre anche i
 *   file. Per questo è una **scelta dell'utente** (casella non spuntata di default), scade
 *   dopo `REMEMBER_DAYS`, sparisce al logout e si può revocare dalle Impostazioni.
 * - Il record è per **utente** (`sub`): su un browser condiviso, un secondo account non
 *   trova la chiave del primo.
 *
 * ⚠️ All'avvio la chiave ricordata va sempre verificata contro il `verificationHash` del
 * server (vedi AppSecurityPrompt): un record che non apre più il blob non deve sbloccare
 * niente.
 */

export const REMEMBER_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

interface RememberedMasterKey {
  masterKey: CryptoKey
  rememberedAt: number
  expiresAt: number
}

function recordName(): string | null {
  const sub = getCurrentUser()?.sub
  return sub ? `letransfer_master_key_${sub}` : null
}

/** Salva la master key per `REMEMBER_DAYS` giorni. Restituisce la scadenza. */
export async function rememberMasterKey(masterKey: CryptoKey, now = Date.now()): Promise<number> {
  if (masterKey.extractable) {
    throw new Error('Una master key esportabile non si salva: chiunque arrivasse alla pagina potrebbe copiarla.')
  }
  const name = recordName()
  if (!name) throw new Error('Utente non identificato: impossibile ricordare il dispositivo.')

  const expiresAt = now + REMEMBER_DAYS * DAY_MS
  const record: RememberedMasterKey = { masterKey, rememberedAt: now, expiresAt }
  await idbSet(name, record)
  return expiresAt
}

async function readValidRecord(now: number): Promise<RememberedMasterKey | null> {
  const name = recordName()
  if (!name) return null
  const record = await idbGet<RememberedMasterKey>(name)
  if (!record?.masterKey || typeof record.expiresAt !== 'number') return null
  if (record.expiresAt <= now) {
    // Scaduta: non la si lascia lì in attesa di un errore futuro.
    await idbDel(name)
    return null
  }
  return record
}

/** La master key ricordata e non scaduta, oppure `null`. Da verificare prima di usarla. */
export async function loadRememberedMasterKey(now = Date.now()): Promise<CryptoKey | null> {
  return (await readValidRecord(now))?.masterKey ?? null
}

/** Fino a quando questo dispositivo è ricordato (timestamp), o `null` se non lo è. */
export async function rememberedUntil(now = Date.now()): Promise<number | null> {
  return (await readValidRecord(now))?.expiresAt ?? null
}

/** Dimentica questo dispositivo: alla prossima sessione servono di nuovo le 24 parole. */
export async function forgetMasterKey(): Promise<void> {
  const name = recordName()
  if (name) await idbDel(name)
}
