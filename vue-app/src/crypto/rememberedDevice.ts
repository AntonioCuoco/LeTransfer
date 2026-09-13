import type { KeyStorage } from './storage'
import { indexedDbKeyStorage } from './keyStore'

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
 * ── Chi è l'utente e dove si salva: lo dice il chiamante ─────────────────────────
 * Il nucleo non legge la sessione dell'app (O3.1): riceve `sub` e, se serve, lo storage. Nel
 * browser lo storage predefinito è IndexedDB; in Node o nei test si passa un altro `KeyStorage`.
 *
 * ⚠️ All'avvio la chiave ricordata va sempre verificata contro il `verificationHash` del
 * server (vedi AppSecurityPrompt): un record che non apre più il blob non deve sbloccare
 * niente.
 */

export const REMEMBER_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/** Di chi è il dispositivo ricordato (`sub`) e dove sta. Senza `sub` non si ricorda niente. */
export interface DeviceContext {
  sub: string | null | undefined
  storage?: KeyStorage
}

interface RememberedMasterKey {
  masterKey: CryptoKey
  rememberedAt: number
  expiresAt: number
}

const recordName = ({ sub }: DeviceContext): string | null => (sub ? `letransfer_master_key_${sub}` : null)
const storageOf = ({ storage }: DeviceContext): KeyStorage => storage ?? indexedDbKeyStorage

/** Salva la master key per `REMEMBER_DAYS` giorni. Restituisce la scadenza. */
export async function rememberMasterKey(masterKey: CryptoKey, context: DeviceContext, now = Date.now()): Promise<number> {
  if (masterKey.extractable) {
    throw new Error('Una master key esportabile non si salva: chiunque arrivasse alla pagina potrebbe copiarla.')
  }
  const name = recordName(context)
  if (!name) throw new Error('Utente non identificato: impossibile ricordare il dispositivo.')

  const expiresAt = now + REMEMBER_DAYS * DAY_MS
  const record: RememberedMasterKey = { masterKey, rememberedAt: now, expiresAt }
  await storageOf(context).set(name, record)
  return expiresAt
}

async function readValidRecord(context: DeviceContext, now: number): Promise<RememberedMasterKey | null> {
  const name = recordName(context)
  if (!name) return null
  const storage = storageOf(context)
  const record = await storage.get<RememberedMasterKey>(name)
  if (!record?.masterKey || typeof record.expiresAt !== 'number') return null
  if (record.expiresAt <= now) {
    // Scaduta: non la si lascia lì in attesa di un errore futuro.
    await storage.delete(name)
    return null
  }
  return record
}

/** La master key ricordata e non scaduta, oppure `null`. Da verificare prima di usarla. */
export async function loadRememberedMasterKey(context: DeviceContext, now = Date.now()): Promise<CryptoKey | null> {
  return (await readValidRecord(context, now))?.masterKey ?? null
}

/** Fino a quando questo dispositivo è ricordato (timestamp), o `null` se non lo è. */
export async function rememberedUntil(context: DeviceContext, now = Date.now()): Promise<number | null> {
  return (await readValidRecord(context, now))?.expiresAt ?? null
}

/** Dimentica questo dispositivo: alla prossima sessione servono di nuovo le 24 parole. */
export async function forgetMasterKey(context: DeviceContext): Promise<void> {
  const name = recordName(context)
  if (name) await storageOf(context).delete(name)
}
