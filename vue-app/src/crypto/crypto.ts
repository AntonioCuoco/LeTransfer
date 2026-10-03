const AES_ALGORITHM = 'AES-GCM'
const AES_KEY_LENGTH = 256
const RSA_ALGORITHM = 'RSA-OAEP'
const RSA_KEY_LENGTH = 4096
const RSA_HASH = 'SHA-256'
// Recovery Key: input = mnemonica a 256 bit di entropia → il brute force è impossibile, 100k basta.
export const PBKDF2_ITER_RECOVERY = 100_000

export interface EncryptedData {
  encrypted: Blob
  iv: Uint8Array
}

export interface EncryptedChunk {
  encrypted: ArrayBuffer
  iv: Uint8Array
}

export interface KeyPairBackup {
  encryptedPrivateKey: string
  iv: string
}

export interface ExportedKeyData {
  key: string
  iv: string
}

export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: AES_ALGORITHM, length: AES_KEY_LENGTH }, true, ['encrypt', 'decrypt'])
}

export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12))
}

export async function encryptFile(file: File, key: CryptoKey): Promise<EncryptedData> {
  const iv = generateIV()
  const fileBuffer = await file.arrayBuffer()
  const encryptedBuffer = await crypto.subtle.encrypt({ name: AES_ALGORITHM, iv }, key, fileBuffer)
  return { encrypted: new Blob([encryptedBuffer], { type: 'application/octet-stream' }), iv }
}

export async function encryptChunk(chunk: ArrayBuffer, key: CryptoKey, iv: Uint8Array, chunkIndex: number): Promise<ArrayBuffer> {
  const aad = new TextEncoder().encode(`chunk-${chunkIndex}`)
  return crypto.subtle.encrypt({ name: AES_ALGORITHM, iv, additionalData: aad }, key, chunk)
}

export async function decryptFile(encryptedBlob: Blob, key: CryptoKey, iv: Uint8Array): Promise<Blob> {
  const encryptedBuffer = await encryptedBlob.arrayBuffer()
  const decryptedBuffer = await crypto.subtle.decrypt({ name: AES_ALGORITHM, iv }, key, encryptedBuffer)
  return new Blob([decryptedBuffer])
}

export async function decryptChunk(encryptedChunk: BufferSource, key: CryptoKey, iv: Uint8Array, chunkIndex: number): Promise<ArrayBuffer> {
  const aad = new TextEncoder().encode(`chunk-${chunkIndex}`)
  return crypto.subtle.decrypt({ name: AES_ALGORITHM, iv, additionalData: aad }, key, encryptedChunk)
}

// ─── Formato file "v2" — cifratura a chunk in streaming (#6) ──────────────────────────────────
// L'oggetto su S3 è la sequenza dei chunk, ognuno: [IV 12B][ciphertext + tag GCM 16B].
// IV unico per chunk + AAD = indice del chunk → previene riordino/sostituzione di chunk.
// I file "v1" (unico blob GCM con un solo IV) restano leggibili dal percorso legacy.

export const FILE_FORMAT_VERSION = 2
export const CHUNK_IV_BYTES = 12
export const GCM_TAG_BYTES = 16
export const CHUNK_OVERHEAD = CHUNK_IV_BYTES + GCM_TAG_BYTES // 28 byte per chunk

/** Dimensione totale del file una volta cifrato in v2 (serve a init/progress). */
export function encryptedSizeV2(originalSize: number, chunkSize: number): number {
  const chunks = Math.max(1, Math.ceil(originalSize / chunkSize))
  return originalSize + chunks * CHUNK_OVERHEAD
}

/** Dimensione del chunk cifrato i-esimo (l'ultimo è più corto). */
export function encryptedChunkSizeV2(index: number, originalSize: number, chunkSize: number): number {
  const plain = Math.min(chunkSize, Math.max(0, originalSize - index * chunkSize))
  return plain + CHUNK_OVERHEAD
}

// ⚠️ Il parametro `iv` di encryptChunkFramed, encryptFileName, wrapFileKey e
// wrapPrivateKeyWithMasterKey esiste SOLO per i vettori di test (vectors/crypto-vectors.json),
// che hanno bisogno di byte deterministici. In produzione non va MAI passato: in AES-GCM un IV
// riusato con la stessa chiave rompe insieme riservatezza e integrità.

/** Cifra un chunk in v2 → [IV][ciphertext+tag], pronto da caricare come parte multipart. */
export async function encryptChunkFramed(
  raw: ArrayBuffer,
  key: CryptoKey,
  index: number,
  iv: Uint8Array = generateIV(),
): Promise<Uint8Array> {
  const encrypted = await encryptChunk(raw, key, iv, index)
  const out = new Uint8Array(CHUNK_IV_BYTES + encrypted.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(encrypted), CHUNK_IV_BYTES)
  return out
}

/** Decifra un chunk in v2 ([IV][ciphertext+tag]). Lancia se il tag GCM non torna (chunk manomesso). */
export async function decryptChunkFramed(framed: Uint8Array, key: CryptoKey, index: number): Promise<ArrayBuffer> {
  const iv = framed.subarray(0, CHUNK_IV_BYTES)
  const ciphertext = framed.subarray(CHUNK_IV_BYTES)
  return decryptChunk(ciphertext, key, iv, index)
}

// ─── Nome del file cifrato — "nameVersion 2" (O2.2) ───────────────────────────────────────────
// Il nome è spesso più rivelatore del contenuto: `Ricorso_Rossi_vs_Bianchi_udienza_12_marzo.pdf`
// dice tutto senza che nessuno apra niente. Fino alla v1 viaggiava in chiaro ed è l'ultima cosa
// che il server vedeva dei contenuti.
//
// Formato, identico nello spirito a quello dei chunk: base64 di [IV 12B][ciphertext + tag 16B].
//
// ⚠️ **AAD `filename`, e non un indice.** È separazione di dominio: senza, un chunk cifrato
// potrebbe essere spacciato per un nome (o viceversa) da chi controlla lo storage, perché
// sarebbero entrambi ciphertext valido sotto la stessa chiave. Con AAD diversi, uno scambio
// fallisce la verifica del tag.
const FILENAME_AAD = 'filename'

/** Versione del formato del nome: assente o 1 = in chiaro (legacy), 2 = cifrato. */
export const FILENAME_VERSION = 2

export async function encryptFileName(name: string, key: CryptoKey, iv: Uint8Array = generateIV()): Promise<string> {
  const aad = new TextEncoder().encode(FILENAME_AAD)
  const encrypted = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv, additionalData: aad },
    key,
    new TextEncoder().encode(name),
  )
  const out = new Uint8Array(CHUNK_IV_BYTES + encrypted.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(encrypted), CHUNK_IV_BYTES)
  return arrayBufferToBase64(out.buffer)
}

/** Lancia se il tag GCM non torna: nome manomesso, chiave sbagliata, o non era un nome. */
export async function decryptFileName(blob: string, key: CryptoKey): Promise<string> {
  const raw = new Uint8Array(base64ToArrayBuffer(blob))
  const iv = raw.subarray(0, CHUNK_IV_BYTES)
  const ciphertext = raw.subarray(CHUNK_IV_BYTES)
  const aad = new TextEncoder().encode(FILENAME_AAD)
  const decrypted = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv, additionalData: aad },
    key,
    ciphertext,
  )
  return new TextDecoder().decode(decrypted)
}

export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const rawKey = await crypto.subtle.exportKey('raw', key)
  return arrayBufferToBase64(rawKey)
}

export async function importKeyFromBase64(base64Key: string): Promise<CryptoKey> {
  const rawKey = base64ToArrayBuffer(base64Key)
  return crypto.subtle.importKey('raw', rawKey, { name: AES_ALGORITHM, length: AES_KEY_LENGTH }, true, ['encrypt', 'decrypt'])
}

export function exportIVToBase64(iv: Uint8Array): string {
  return arrayBufferToBase64(iv.buffer)
}

export function importIVFromBase64(base64IV: string): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(base64IV))
}

export async function createShareableKeyData(key: CryptoKey, iv: Uint8Array): Promise<ExportedKeyData> {
  return { key: await exportKeyToBase64(key), iv: exportIVToBase64(iv) }
}

export function parseKeyFromHash(hash: string): { key: string; iv: string } | null {
  if (!hash || hash.length < 2) return null
  const params = new URLSearchParams(hash.substring(1))
  const key = params.get('key')
  const iv = params.get('iv')
  if (!key || !iv) return null
  return { key, iv }
}

export function createKeyHash(keyData: ExportedKeyData): string {
  return `#key=${encodeURIComponent(keyData.key)}&iv=${encodeURIComponent(keyData.iv)}`
}

export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: RSA_ALGORITHM, modulusLength: RSA_KEY_LENGTH, publicExponent: new Uint8Array([1, 0, 1]), hash: RSA_HASH },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  )
}

export async function exportPublicKeyToJWK(publicKey: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', publicKey)
}

export async function importPublicKeyFromJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: RSA_ALGORITHM, hash: RSA_HASH }, true, ['encrypt', 'wrapKey'])
}

export async function exportPrivateKeyToJWK(privateKey: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', privateKey)
}

export async function importPrivateKeyFromJWK(jwk: JsonWebKey, extractable = true): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: RSA_ALGORITHM, hash: RSA_HASH }, extractable, ['decrypt', 'unwrapKey'])
}

export async function wrapKeyWithPublicKey(aesKey: CryptoKey, rsaPublicKey: CryptoKey): Promise<string> {
  const wrappedKey = await crypto.subtle.wrapKey('raw', aesKey, rsaPublicKey, { name: RSA_ALGORITHM })
  return arrayBufferToBase64(wrappedKey)
}

export async function unwrapKeyWithPrivateKey(wrappedKeyBase64: string, rsaPrivateKey: CryptoKey): Promise<CryptoKey> {
  const wrappedKey = base64ToArrayBuffer(wrappedKeyBase64)
  return crypto.subtle.unwrapKey('raw', wrappedKey, rsaPrivateKey, { name: RSA_ALGORITHM }, { name: AES_ALGORITHM, length: AES_KEY_LENGTH }, true, ['encrypt', 'decrypt'])
}

export async function deriveKeyFromPassword(password: string, salt: Uint8Array, iterations: number = PBKDF2_ITER_RECOVERY): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    passwordKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

// Backup della private key RSA cifrato con la MASTER KEY (AES-256 derivata dalla recovery key).
// Nessuna password/PBKDF2: la master key è già a piena entropia (256 bit), quindi il blob è
// inattaccabile anche se il server viene compromesso. È il meccanismo di backup/restore
// multi-dispositivo della keypair di condivisione.
export async function wrapPrivateKeyWithMasterKey(
  privateKey: CryptoKey,
  masterKey: CryptoKey,
  iv: Uint8Array = generateIV(),
): Promise<KeyPairBackup> {
  const privateKeyJWK = await exportPrivateKeyToJWK(privateKey)
  const encrypted = await crypto.subtle.encrypt({ name: AES_ALGORITHM, iv }, masterKey, new TextEncoder().encode(JSON.stringify(privateKeyJWK)))
  return { encryptedPrivateKey: arrayBufferToBase64(encrypted), iv: arrayBufferToBase64(iv.buffer) }
}

export async function unwrapPrivateKeyWithMasterKey(backup: KeyPairBackup, masterKey: CryptoKey): Promise<CryptoKey> {
  const iv = new Uint8Array(base64ToArrayBuffer(backup.iv))
  const encrypted = base64ToArrayBuffer(backup.encryptedPrivateKey)
  const decrypted = await crypto.subtle.decrypt({ name: AES_ALGORITHM, iv }, masterKey, encrypted)
  // Estraibile: verrà ri-persistita NON estraibile in IDB e tenuta in RAM solo per la sessione.
  return importPrivateKeyFromJWK(JSON.parse(new TextDecoder().decode(decrypted)), true)
}

/**
 * Cambio delle 24 parole: apre il backup con la master key vecchia e lo richiude con la nuova,
 * **byte per byte uguale** dentro. Il JSON non si decodifica e non si riscrive: non è canonico,
 * e una riserializzazione potrebbe cambiare qualcosa che un altro client si aspetta (stessa
 * scelta di `rewrap_backup` nel client desktop).
 */
export async function rewrapPrivateKeyBackup(
  backup: KeyPairBackup,
  oldMasterKey: CryptoKey,
  newMasterKey: CryptoKey,
  iv: Uint8Array = generateIV(),
): Promise<KeyPairBackup> {
  const plain = new Uint8Array(await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: new Uint8Array(base64ToArrayBuffer(backup.iv)) },
    oldMasterKey,
    base64ToArrayBuffer(backup.encryptedPrivateKey),
  ))
  try {
    const sealed = await crypto.subtle.encrypt({ name: AES_ALGORITHM, iv }, newMasterKey, plain)
    return { encryptedPrivateKey: arrayBufferToBase64(sealed), iv: arrayBufferToBase64(iv.buffer) }
  } finally {
    plain.fill(0)
  }
}

export async function wrapFileKey(
  fileKey: CryptoKey,
  wrappingKey: CryptoKey,
  s3Key: string,
  iv: Uint8Array = generateIV(),
): Promise<{ wrappedKey: string; wrapIV: string }> {
  const keyData = await crypto.subtle.exportKey('raw', fileKey)
  // AAD = s3Key (#9): lega crittograficamente la file key al file specifico. Un server malevolo
  // che scambia le entry non può far decifrare la wrapped key con un s3Key diverso.
  const aad = new TextEncoder().encode(s3Key)
  const encryptedBuffer = await crypto.subtle.encrypt({ name: AES_ALGORITHM, iv, additionalData: aad }, wrappingKey, keyData)
  return { wrappedKey: arrayBufferToBase64(encryptedBuffer), wrapIV: arrayBufferToBase64(iv.buffer) }
}

export async function unwrapFileKey(wrappedKeyBase64: string, wrapIVBase64: string, wrappingKey: CryptoKey, s3Key: string): Promise<CryptoKey> {
  const encryptedBuffer = base64ToArrayBuffer(wrappedKeyBase64)
  const iv = base64ToArrayBuffer(wrapIVBase64)
  const aad = new TextEncoder().encode(s3Key)
  let keyData: ArrayBuffer
  try {
    // Formato nuovo (#9): file key legata al suo s3Key tramite AAD.
    keyData = await crypto.subtle.decrypt({ name: AES_ALGORITHM, iv, additionalData: aad }, wrappingKey, encryptedBuffer)
  } catch {
    // Fallback per le chiavi VECCHIE, wrappate senza AAD (pre-#9): non rompiamo i file esistenti.
    keyData = await crypto.subtle.decrypt({ name: AES_ALGORITHM, iv }, wrappingKey, encryptedBuffer)
  }
  return crypto.subtle.importKey('raw', keyData, { name: AES_ALGORITHM, length: AES_KEY_LENGTH }, true, ['encrypt', 'decrypt'])
}

export function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  let s = base64.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const binary = atob(s)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}
