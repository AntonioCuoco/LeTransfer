/**
 * La master key di Novren con Novren ID.
 *
 * Prima nasceva dalle 24 parole di Novren. Ora le 24 parole (e la password, e il recupero) sono
 * di Novren ID, una volta per tutta la famiglia: la master key di Novren è una chiave AES-256
 * **casuale**, generata nel browser al primo accesso e avvolta sotto la **chiave del prodotto**
 * (`productKey[novren]`), che Novren ID consegna all'app a ogni accesso. Tutto ciò che stava
 * sotto la master key (chiavi dei file, backup della chiave privata) resta com'era.
 *
 *   password / 24 parole / dispositivo ─▶ Novren ID ─▶ productKey[novren] ─▶ master key ─▶ file
 *
 * ── La prova ────────────────────────────────────────────────────────────────────
 * 32 byte casuali cifrati **sotto la master key** (`wrappedProof`); il server tiene solo il loro
 * SHA-256 (`proofHash`). Servono a due cose:
 *  • confermare la cancellazione dell'account senza la password, che Novren non vede più: solo
 *    chi ha la master key apre la prova (un token rubato non basta);
 *  • verificare una master key ricordata su questo dispositivo: se apre la prova, è quella giusta.
 *
 * Le buste sono `p1.` + base64url([IV 12 B][ciphertext+tag]), con un AAD che le lega all'account:
 * una busta di un altro account, scambiata dal server, non si apre.
 */

const PREFIX = 'p1.'
const AAD_MASTER = 'novren/master-key/novren-id/v1'
const AAD_PROOF = 'novren/account-proof/v1'

const utf8 = (text: string) => new TextEncoder().encode(text)

function b64u(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64u(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

async function seal(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(aad) }, key, plaintext))
  const out = new Uint8Array(12 + sealed.length)
  out.set(iv)
  out.set(sealed, 12)
  return PREFIX + b64u(out)
}

async function open(key: CryptoKey, envelope: string, aad: string): Promise<Uint8Array> {
  if (!envelope.startsWith(PREFIX)) throw new Error('Busta di formato sconosciuto.')
  const raw = fromB64u(envelope.slice(PREFIX.length))
  if (raw.length <= 12) throw new Error('Busta troppo corta.')
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12), additionalData: utf8(aad) }, key, raw.subarray(12)))
}

/** La master key come la usa il resto dell'app: AES-GCM, **non estraibile**. */
function importMasterKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export interface NewMasterKey {
  masterKey: CryptoKey
  /** Per `POST /api/user/recovery-key/setup`. */
  setup: { wrappedMasterKey: string; wrappedProof: string; proofHash: string }
}

/** Il primo accesso: una master key nuova, avvolta sotto la chiave del prodotto, con la sua prova. */
export async function createMasterKey(productKey: CryptoKey, accountId: string): Promise<NewMasterKey> {
  const raw = crypto.getRandomValues(new Uint8Array(32))
  const proof = crypto.getRandomValues(new Uint8Array(32))
  try {
    const masterKey = await importMasterKey(raw)
    const wrappedMasterKey = await seal(productKey, raw, `${AAD_MASTER}:${accountId}`)
    const wrappedProof = await seal(masterKey, proof, `${AAD_PROOF}:${accountId}`)
    const proofHash = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', proof)))
    return { masterKey, setup: { wrappedMasterKey, wrappedProof, proofHash } }
  } finally {
    raw.fill(0)
    proof.fill(0)
  }
}

/** Apre la master key con la chiave del prodotto. Lancia se la busta non è di questo account. */
export async function openMasterKey(wrappedMasterKey: string, productKey: CryptoKey, accountId: string): Promise<CryptoKey> {
  const raw = await open(productKey, wrappedMasterKey, `${AAD_MASTER}:${accountId}`)
  try {
    if (raw.length !== 32) throw new Error('Master key di lunghezza non valida.')
    return await importMasterKey(raw)
  } finally {
    raw.fill(0)
  }
}

/** La prova in chiaro (base64url), per confermare la cancellazione. Lancia con la chiave sbagliata. */
export async function openProof(wrappedProof: string, masterKey: CryptoKey, accountId: string): Promise<string> {
  const proof = await open(masterKey, wrappedProof, `${AAD_PROOF}:${accountId}`)
  try {
    return b64u(proof)
  } finally {
    proof.fill(0)
  }
}

/** Questa master key è dell'account? (Apre la prova.) Per una chiave ricordata sul dispositivo. */
export async function masterKeyMatches(masterKey: CryptoKey, wrappedProof: string, accountId: string): Promise<boolean> {
  try {
    await openProof(wrappedProof, masterKey, accountId)
    return true
  } catch {
    return false
  }
}
