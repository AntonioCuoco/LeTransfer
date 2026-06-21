const AES_ALGORITHM = 'AES-GCM'
const AES_KEY_LENGTH = 256
const RSA_ALGORITHM = 'RSA-OAEP'
const RSA_KEY_LENGTH = 4096
const RSA_HASH = 'SHA-256'
const PBKDF2_ITERATIONS = 100000

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
  salt: string
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

export async function decryptChunk(encryptedChunk: ArrayBuffer, key: CryptoKey, iv: Uint8Array, chunkIndex: number): Promise<ArrayBuffer> {
  const aad = new TextEncoder().encode(`chunk-${chunkIndex}`)
  return crypto.subtle.decrypt({ name: AES_ALGORITHM, iv, additionalData: aad }, key, encryptedChunk)
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

export async function importPrivateKeyFromJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: RSA_ALGORITHM, hash: RSA_HASH }, true, ['decrypt', 'unwrapKey'])
}

export async function wrapKeyWithPublicKey(aesKey: CryptoKey, rsaPublicKey: CryptoKey): Promise<string> {
  const wrappedKey = await crypto.subtle.wrapKey('raw', aesKey, rsaPublicKey, { name: RSA_ALGORITHM })
  return arrayBufferToBase64(wrappedKey)
}

export async function unwrapKeyWithPrivateKey(wrappedKeyBase64: string, rsaPrivateKey: CryptoKey): Promise<CryptoKey> {
  const wrappedKey = base64ToArrayBuffer(wrappedKeyBase64)
  return crypto.subtle.unwrapKey('raw', wrappedKey, rsaPrivateKey, { name: RSA_ALGORITHM }, { name: AES_ALGORITHM, length: AES_KEY_LENGTH }, true, ['encrypt', 'decrypt'])
}

export async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptPrivateKeyForBackup(privateKey: CryptoKey, password: string): Promise<KeyPairBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = generateIV()
  const derivedKey = await deriveKeyFromPassword(password, salt)
  const privateKeyJWK = await exportPrivateKeyToJWK(privateKey)
  const encryptedPrivateKey = await crypto.subtle.encrypt({ name: AES_ALGORITHM, iv }, derivedKey, new TextEncoder().encode(JSON.stringify(privateKeyJWK)))
  return { encryptedPrivateKey: arrayBufferToBase64(encryptedPrivateKey), salt: arrayBufferToBase64(salt.buffer), iv: arrayBufferToBase64(iv.buffer) }
}

export async function decryptPrivateKeyFromBackup(backup: KeyPairBackup, password: string): Promise<CryptoKey> {
  const salt = new Uint8Array(base64ToArrayBuffer(backup.salt))
  const iv = new Uint8Array(base64ToArrayBuffer(backup.iv))
  const encryptedPrivateKey = base64ToArrayBuffer(backup.encryptedPrivateKey)
  const derivedKey = await deriveKeyFromPassword(password, salt)
  const decryptedBuffer = await crypto.subtle.decrypt({ name: AES_ALGORITHM, iv }, derivedKey, encryptedPrivateKey)
  return importPrivateKeyFromJWK(JSON.parse(new TextDecoder().decode(decryptedBuffer)))
}

export async function wrapFileKey(fileKey: CryptoKey, wrappingKey: CryptoKey): Promise<{ wrappedKey: string; wrapIV: string }> {
  const iv = generateIV()
  const keyData = await crypto.subtle.exportKey('raw', fileKey)
  const encryptedBuffer = await crypto.subtle.encrypt({ name: AES_ALGORITHM, iv }, wrappingKey, keyData)
  return { wrappedKey: arrayBufferToBase64(encryptedBuffer), wrapIV: arrayBufferToBase64(iv.buffer) }
}

export async function unwrapFileKey(wrappedKeyBase64: string, wrapIVBase64: string, wrappingKey: CryptoKey): Promise<CryptoKey> {
  const encryptedBuffer = base64ToArrayBuffer(wrappedKeyBase64)
  const iv = base64ToArrayBuffer(wrapIVBase64)
  const keyData = await crypto.subtle.decrypt({ name: AES_ALGORITHM, iv }, wrappingKey, encryptedBuffer)
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
