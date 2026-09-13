import { arrayBufferToBase64, base64ToArrayBuffer, generateIV, unwrapKeyWithPrivateKey, wrapKeyWithPublicKey } from './crypto'

/**
 * Wrapping ibrido **post-quantum** della chiave di un file — formato v2 (roadmap O2.3).
 *
 * ── Perché ──────────────────────────────────────────────────────────────────────
 * La chiave di un file condiviso fra utenti resta salvata sul server, avvolta nella chiave
 * pubblica del destinatario. Con RSA-OAEP, chi copia oggi quel database (un furto, un
 * sequestro) potrà aprirla con un computer quantistico fra dieci o quindici anni: è il
 * «harvest now, decrypt later», e per il trasferimento file è una minaccia concreta.
 *
 * ── Perché RSA **e** X-Wing, non solo X-Wing ────────────────────────────────────
 * X-Wing (ML-KEM-768 + X25519) resiste al quantum, ma la sua chiave segreta è un seme di
 * 32 byte gestito da una libreria JavaScript: **copiabile** da uno script malevolo nella
 * pagina. La chiave privata RSA invece è una `CryptoKey` non esportabile. La chiave che apre
 * il file (KEK) nasce da ENTRAMBI i segreti, quindi:
 *  - rubare il seme X-Wing non basta: serve anche usare la chiave RSA, che non si copia;
 *  - rompere RSA con un computer quantistico non basta: serve anche X-Wing;
 *  - un difetto di ML-KEM o della libreria (`@noble/post-quantum`, **non** ancora sottoposta
 *    ad audit indipendente) non porta mai la sicurezza sotto quella del formato v1.
 * X-Wing a sua volta regge se regge almeno uno fra ML-KEM-768 e X25519.
 *
 * ── Formato ─────────────────────────────────────────────────────────────────────
 *   "v2." b64u(cRsa) "." b64u(cXWing) "." b64u(iv) "." b64u(sealed)
 *
 *   kRsa        = 32 byte casuali
 *   cRsa        = RSA-OAEP-SHA256(pk RSA, kRsa)                       512 byte
 *   cXWing, ss  = X-Wing.Encapsulate(pk X-Wing)                        1120 + 32 byte
 *   KEK         = HKDF-SHA256(ikm  = kRsa || ss,
 *                             salt = "novren/key-wrap/v2",
 *                             info = SHA-256(cRsa || cXWing || pk X-Wing))
 *   sealed      = AES-256-GCM(KEK, iv, chiave del file raw, AAD = "novren/key-wrap/v2")
 *
 * La versione sta **nel blob** e non in un campo accanto: il formato v1 è base64url puro, che
 * non contiene mai un punto, quindi i due non si possono confondere. L'`info` di HKDF lega la
 * KEK a entrambi i ciphertext e alla chiave X-Wing: una parte presa da un altro blob cambia la
 * KEK e il tag GCM rifiuta. Specifica eseguibile in `vectors/crypto-vectors.json`.
 */

export const KEY_WRAP_V2_LABEL = 'novren/key-wrap/v2'
const SEED_BACKUP_AAD = 'novren/xwing-seed-backup/v1'

export const XWING_SEED_BYTES = 32
export const XWING_PUBLIC_KEY_BYTES = 1216

/**
 * Interruttore di **scrittura** del formato v2. La lettura c'è sempre.
 * Spegnerlo fa tornare i nuovi invii a RSA-OAEP (v1) senza rompere niente di già scritto:
 * è la leva di rientro se in produzione emergesse un problema.
 */
export const HYBRID_KEY_WRAP = true

/** Le chiavi pubbliche di un destinatario, come arrivano dal server. */
export interface RecipientPublicKeys {
  rsa: CryptoKey
  rsaJwk: JsonWebKey
  /** `null` = il destinatario non ha ancora pubblicato una chiave X-Wing: si usa il formato v1. */
  xwing: Uint8Array | null
}

/** Backup del seme X-Wing, cifrato con la master key. Va al server insieme alla chiave pubblica. */
export interface XWingSeedBackup {
  encryptedSeed: string
  seedIV: string
}

/** Solo per i vettori di test: in produzione la casualità la sceglie il codice, mai il chiamante. */
export interface HybridWrapTestInputs {
  rsaSecret?: Uint8Array
  eseed?: Uint8Array
  iv?: Uint8Array
}

const utf8 = (text: string) => new TextEncoder().encode(text)
const b64u = (bytes: Uint8Array) => arrayBufferToBase64(bytes.slice().buffer)
const fromB64u = (value: string) => new Uint8Array(base64ToArrayBuffer(value))

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

// La libreria si carica solo quando serve davvero: chi usa soltanto i link pubblici (tutto
// simmetrico, niente chiavi pubbliche) non scarica il codice di ML-KEM.
let xwingModule: Promise<typeof import('@noble/post-quantum/hybrid.js')> | null = null
async function loadXWing() {
  xwingModule ??= import('@noble/post-quantum/hybrid.js')
  return (await xwingModule).ml_kem768_x25519
}

/** Un seme X-Wing nuovo: è l'intera chiave segreta. */
export function generateXWingSeed(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(XWING_SEED_BYTES))
}

export async function xwingPublicKeyFromSeed(seed: Uint8Array): Promise<Uint8Array> {
  if (seed.byteLength !== XWING_SEED_BYTES) throw new Error('Seme X-Wing di lunghezza non valida')
  // Copia: le routine della libreria possono azzerare i buffer segreti che ricevono.
  return (await loadXWing()).getPublicKey(seed.slice())
}

export function isHybridKeyWrap(blob: string): boolean {
  return blob.startsWith('v2.')
}

async function deriveKek(rsaSecret: Uint8Array, xwingShared: Uint8Array, cRsa: Uint8Array, cXWing: Uint8Array, xwingPublicKey: Uint8Array) {
  const info = new Uint8Array(await crypto.subtle.digest('SHA-256', concat(cRsa, cXWing, xwingPublicKey)))
  const ikm = concat(rsaSecret, xwingShared)
  try {
    const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey'])
    return await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: utf8(KEY_WRAP_V2_LABEL), info },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  } finally {
    ikm.fill(0)
  }
}

export async function wrapFileKeyHybrid(
  fileKey: CryptoKey,
  rsaPublicKey: CryptoKey,
  xwingPublicKey: Uint8Array,
  test: HybridWrapTestInputs = {},
): Promise<string> {
  if (xwingPublicKey.byteLength !== XWING_PUBLIC_KEY_BYTES) throw new Error('Chiave pubblica X-Wing di lunghezza non valida')
  const xwing = await loadXWing()

  const rsaSecret = test.rsaSecret ?? crypto.getRandomValues(new Uint8Array(32))
  const cRsa = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaPublicKey, rsaSecret))
  const { cipherText: cXWing, sharedSecret } = xwing.encapsulate(xwingPublicKey, test.eseed?.slice())

  try {
    const kek = await deriveKek(rsaSecret, sharedSecret, cRsa, cXWing, xwingPublicKey)
    const iv = test.iv ?? generateIV()
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', fileKey))
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(KEY_WRAP_V2_LABEL) }, kek, raw))
    raw.fill(0)
    return ['v2', b64u(cRsa), b64u(cXWing), b64u(iv), b64u(sealed)].join('.')
  } finally {
    sharedSecret.fill(0)
    if (!test.rsaSecret) rsaSecret.fill(0)
  }
}

export async function unwrapFileKeyHybrid(blob: string, rsaPrivateKey: CryptoKey, xwingSeed: Uint8Array): Promise<CryptoKey> {
  const parts = blob.split('.')
  if (parts.length !== 5 || parts[0] !== 'v2') throw new Error('Formato della chiave cifrata v2 non valido')
  const [cRsa, cXWing, iv, sealed] = parts.slice(1).map(fromB64u)
  const xwing = await loadXWing()

  const rsaSecret = new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, rsaPrivateKey, cRsa))
  const xwingPublicKey = xwing.getPublicKey(xwingSeed.slice())
  const sharedSecret = xwing.decapsulate(cXWing, xwingSeed.slice())
  try {
    if (rsaSecret.byteLength !== 32) throw new Error('Segreto RSA di lunghezza non valida')
    const kek = await deriveKek(rsaSecret, sharedSecret, cRsa, cXWing, xwingPublicKey)
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: utf8(KEY_WRAP_V2_LABEL) }, kek, sealed)
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  } finally {
    rsaSecret.fill(0)
    sharedSecret.fill(0)
  }
}

/** Il punto unico di scrittura: v2 se il destinatario ha una chiave X-Wing e l'interruttore è acceso. */
export async function wrapFileKeyForRecipient(fileKey: CryptoKey, recipient: RecipientPublicKeys): Promise<string> {
  return HYBRID_KEY_WRAP && recipient.xwing
    ? wrapFileKeyHybrid(fileKey, recipient.rsa, recipient.xwing)
    : wrapKeyWithPublicKey(fileKey, recipient.rsa)
}

/** Il file è in formato v2 ma su questo dispositivo il seme X-Wing non c'è. Il messaggio è per l'utente. */
export class MissingPostQuantumKey extends Error {
  constructor() {
    super('Questo file è protetto anche dalla tua chiave post-quantum, che su questo dispositivo non è ancora pronta: sblocca le tue chiavi con le 24 parole e riprova.')
    this.name = 'MissingPostQuantumKey'
  }
}

/** Il punto unico di lettura: riconosce il formato dal blob stesso. */
export async function unwrapReceivedFileKey(blob: string, rsaPrivateKey: CryptoKey, xwingSeed: Uint8Array | null): Promise<CryptoKey> {
  if (!isHybridKeyWrap(blob)) return unwrapKeyWithPrivateKey(blob, rsaPrivateKey)
  if (!xwingSeed) throw new MissingPostQuantumKey()
  return unwrapFileKeyHybrid(blob, rsaPrivateKey, xwingSeed)
}

/** ⚠️ `iv` solo per i vettori di test (vedi crypto.ts). */
export async function wrapXWingSeedWithMasterKey(
  seed: Uint8Array,
  masterKey: CryptoKey,
  iv: Uint8Array = generateIV(),
): Promise<XWingSeedBackup> {
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(SEED_BACKUP_AAD) }, masterKey, seed))
  return { encryptedSeed: b64u(sealed), seedIV: b64u(iv) }
}

export async function unwrapXWingSeedWithMasterKey(backup: XWingSeedBackup, masterKey: CryptoKey): Promise<Uint8Array> {
  const seed = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64u(backup.seedIV), additionalData: utf8(SEED_BACKUP_AAD) },
    masterKey,
    fromB64u(backup.encryptedSeed),
  ))
  if (seed.byteLength !== XWING_SEED_BYTES) throw new Error('Backup del seme X-Wing non valido')
  return seed
}

export const xwingPublicKeyToBase64 = b64u
export const xwingPublicKeyFromBase64 = (value: string): Uint8Array => {
  const bytes = fromB64u(value)
  if (bytes.byteLength !== XWING_PUBLIC_KEY_BYTES) throw new Error('Chiave pubblica X-Wing di lunghezza non valida')
  return bytes
}
