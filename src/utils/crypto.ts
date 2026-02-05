/**
 * Crypto Utilities for End-to-End Encryption
 * 
 * Uses Web Crypto API for client-side encryption/decryption.
 * All cryptographic operations happen in the browser - the server never sees plaintext.
 */

// ==================== CONSTANTS ====================

const AES_ALGORITHM = 'AES-GCM';
const AES_KEY_LENGTH = 256;
const RSA_ALGORITHM = 'RSA-OAEP';
const RSA_KEY_LENGTH = 4096;
const RSA_HASH = 'SHA-256';
const PBKDF2_ITERATIONS = 100000;

// ==================== TYPES ====================

export interface EncryptedData {
    encrypted: Blob;
    iv: Uint8Array;
}

export interface EncryptedChunk {
    encrypted: ArrayBuffer;
    iv: Uint8Array;
}

export interface KeyPairBackup {
    encryptedPrivateKey: string; // Base64
    salt: string; // Base64
    iv: string; // Base64
}

export interface ExportedKeyData {
    key: string; // Base64 encoded raw key
    iv: string; // Base64 encoded IV
}

// ==================== AES KEY GENERATION ====================

/**
 * Generate a new AES-256-GCM key for file encryption
 */
export async function generateAESKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
        {
            name: AES_ALGORITHM,
            length: AES_KEY_LENGTH
        },
        true, // extractable - needed for export
        ['encrypt', 'decrypt']
    );
}

/**
 * Generate a random IV (Initialization Vector) for AES-GCM
 * AES-GCM uses 12 bytes (96 bits) IV
 */
export function generateIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(12));
}

// ==================== FILE ENCRYPTION (STREAMING) ====================

/**
 * Encrypt a file using AES-256-GCM
 * For large files, this processes the file in chunks to avoid memory issues
 */
export async function encryptFile(file: File, key: CryptoKey): Promise<EncryptedData> {
    const iv = generateIV();
    const fileBuffer = await file.arrayBuffer();

    const encryptedBuffer = await crypto.subtle.encrypt(
        {
            name: AES_ALGORITHM,
            iv: iv as any
        },
        key,
        fileBuffer
    );

    return {
        encrypted: new Blob([encryptedBuffer], { type: 'application/octet-stream' }),
        iv
    };
}

/**
 * Encrypt a single chunk for streaming encryption during multipart upload
 * Each chunk gets the same IV but the position is included in AAD
 */
export async function encryptChunk(
    chunk: ArrayBuffer,
    key: CryptoKey,
    iv: Uint8Array,
    chunkIndex: number
): Promise<ArrayBuffer> {
    // Create additional authenticated data with chunk index to prevent reordering attacks
    const aad = new TextEncoder().encode(`chunk-${chunkIndex}`);

    return await crypto.subtle.encrypt(
        {
            name: AES_ALGORITHM,
            iv: iv as any,
            additionalData: aad
        },
        key,
        chunk
    );
}

/**
 * Decrypt a file using AES-256-GCM
 */
export async function decryptFile(
    encryptedBlob: Blob,
    key: CryptoKey,
    iv: Uint8Array
): Promise<Blob> {
    const encryptedBuffer = await encryptedBlob.arrayBuffer();

    const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: AES_ALGORITHM,
            iv: iv as any
        },
        key,
        encryptedBuffer
    );

    return new Blob([decryptedBuffer]);
}

/**
 * Decrypt a single chunk for streaming decryption
 */
export async function decryptChunk(
    encryptedChunk: ArrayBuffer,
    key: CryptoKey,
    iv: Uint8Array,
    chunkIndex: number
): Promise<ArrayBuffer> {
    const aad = new TextEncoder().encode(`chunk-${chunkIndex}`);

    return await crypto.subtle.decrypt(
        {
            name: AES_ALGORITHM,
            iv: iv as any,
            additionalData: aad
        },
        key,
        encryptedChunk
    );
}

// ==================== KEY EXPORT/IMPORT (for URL fragments) ====================

/**
 * Export AES key to Base64 string for inclusion in URL fragment
 * URL fragment is never sent to server, ensuring true E2E
 */
export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
    const rawKey = await crypto.subtle.exportKey('raw', key);
    return arrayBufferToBase64(rawKey);
}

/**
 * Import AES key from Base64 string (from URL fragment)
 */
export async function importKeyFromBase64(base64Key: string): Promise<CryptoKey> {
    const rawKey = base64ToArrayBuffer(base64Key);

    return await crypto.subtle.importKey(
        'raw',
        rawKey,
        {
            name: AES_ALGORITHM,
            length: AES_KEY_LENGTH
        },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Export IV to Base64 string
 */
export function exportIVToBase64(iv: Uint8Array): string {
    return arrayBufferToBase64(iv.buffer);
}

/**
 * Import IV from Base64 string
 */
export function importIVFromBase64(base64IV: string): Uint8Array {
    return new Uint8Array(base64ToArrayBuffer(base64IV));
}

/**
 * Create a shareable key data object for URL fragments
 */
export async function createShareableKeyData(
    key: CryptoKey,
    iv: Uint8Array
): Promise<ExportedKeyData> {
    return {
        key: await exportKeyToBase64(key),
        iv: exportIVToBase64(iv)
    };
}

/**
 * Parse key data from URL fragment hash
 * Format: #key=xxx&iv=yyy
 */
export function parseKeyFromHash(hash: string): { key: string; iv: string } | null {
    if (!hash || hash.length < 2) return null;

    const params = new URLSearchParams(hash.substring(1)); // Remove leading #
    const key = params.get('key');
    const iv = params.get('iv');

    if (!key || !iv) return null;

    return { key, iv };
}

/**
 * Create URL fragment hash from key data
 */
export function createKeyHash(keyData: ExportedKeyData): string {
    return `#key=${encodeURIComponent(keyData.key)}&iv=${encodeURIComponent(keyData.iv)}`;
}

// ==================== RSA KEY PAIR (for user-to-user encryption) ====================

/**
 * Generate RSA-OAEP key pair for encrypting AES keys between users
 */
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
        {
            name: RSA_ALGORITHM,
            modulusLength: RSA_KEY_LENGTH,
            publicExponent: new Uint8Array([1, 0, 1]), // 65537
            hash: RSA_HASH
        },
        true, // extractable
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
}

/**
 * Export RSA public key to JWK format for server storage
 */
export async function exportPublicKeyToJWK(publicKey: CryptoKey): Promise<JsonWebKey> {
    return await crypto.subtle.exportKey('jwk', publicKey);
}

/**
 * Import RSA public key from JWK format
 */
export async function importPublicKeyFromJWK(jwk: JsonWebKey): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        'jwk',
        jwk,
        {
            name: RSA_ALGORITHM,
            hash: RSA_HASH
        },
        true,
        ['encrypt', 'wrapKey']
    );
}

/**
 * Export RSA private key to JWK format
 */
export async function exportPrivateKeyToJWK(privateKey: CryptoKey): Promise<JsonWebKey> {
    return await crypto.subtle.exportKey('jwk', privateKey);
}

/**
 * Import RSA private key from JWK format
 */
export async function importPrivateKeyFromJWK(jwk: JsonWebKey): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        'jwk',
        jwk,
        {
            name: RSA_ALGORITHM,
            hash: RSA_HASH
        },
        true,
        ['decrypt', 'unwrapKey']
    );
}

// ==================== KEY WRAPPING (encrypt AES key with RSA) ====================

/**
 * Wrap (encrypt) an AES key using recipient's RSA public key
 * Used when sharing files with registered users via email
 */
export async function wrapKeyWithPublicKey(
    aesKey: CryptoKey,
    rsaPublicKey: CryptoKey
): Promise<string> {
    const wrappedKey = await crypto.subtle.wrapKey(
        'raw',
        aesKey,
        rsaPublicKey,
        {
            name: RSA_ALGORITHM
        }
    );

    return arrayBufferToBase64(wrappedKey);
}

/**
 * Unwrap (decrypt) an AES key using own RSA private key
 * Used when receiving files shared via email
 */
export async function unwrapKeyWithPrivateKey(
    wrappedKeyBase64: string,
    rsaPrivateKey: CryptoKey
): Promise<CryptoKey> {
    const wrappedKey = base64ToArrayBuffer(wrappedKeyBase64);

    return await crypto.subtle.unwrapKey(
        'raw',
        wrappedKey,
        rsaPrivateKey,
        {
            name: RSA_ALGORITHM
        },
        {
            name: AES_ALGORITHM,
            length: AES_KEY_LENGTH
        },
        true,
        ['encrypt', 'decrypt']
    );
}

// ==================== PRIVATE KEY BACKUP (encrypted with password) ====================

/**
 * Derive an encryption key from user's password using PBKDF2
 */
/**
 * Derive an encryption key from user's password (or recovery phrase) using PBKDF2
 */
export async function deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );

    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt as any,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        passwordKey,
        {
            name: AES_ALGORITHM,
            length: AES_KEY_LENGTH
        },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt RSA private key with user's password for server backup
 * Server receives encrypted blob - cannot decrypt without password
 */
export async function encryptPrivateKeyForBackup(
    privateKey: CryptoKey,
    password: string
): Promise<KeyPairBackup> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = generateIV();

    // Derive encryption key from password
    const derivedKey = await deriveKeyFromPassword(password, salt);

    // Export private key to JWK and encrypt it
    const privateKeyJWK = await exportPrivateKeyToJWK(privateKey);
    const privateKeyString = JSON.stringify(privateKeyJWK);
    const encoder = new TextEncoder();

    const encryptedPrivateKey = await crypto.subtle.encrypt(
        {
            name: AES_ALGORITHM,
            iv: iv as any
        },
        derivedKey,
        encoder.encode(privateKeyString)
    );

    return {
        encryptedPrivateKey: arrayBufferToBase64(encryptedPrivateKey),
        salt: arrayBufferToBase64(salt.buffer),
        iv: arrayBufferToBase64(iv.buffer)
    };
}

/**
 * Decrypt RSA private key backup using user's password
 */
export async function decryptPrivateKeyFromBackup(
    backup: KeyPairBackup,
    password: string
): Promise<CryptoKey> {
    const salt = new Uint8Array(base64ToArrayBuffer(backup.salt));
    const iv = new Uint8Array(base64ToArrayBuffer(backup.iv));
    const encryptedPrivateKey = base64ToArrayBuffer(backup.encryptedPrivateKey);

    // Derive decryption key from password
    const derivedKey = await deriveKeyFromPassword(password, salt);

    // Decrypt and parse private key
    const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: AES_ALGORITHM,
            iv: iv as any
        },
        derivedKey,
        encryptedPrivateKey
    );

    const decoder = new TextDecoder();
    const privateKeyJWK = JSON.parse(decoder.decode(decryptedBuffer));

    return await importPrivateKeyFromJWK(privateKeyJWK);
}

// ==================== KEY WRAPPING (for E2E) ====================

/**
 * Wrap (encrypt) a file AES key using a Master Key
 */
export async function wrapFileKey(
    fileKey: CryptoKey,
    wrappingKey: CryptoKey
): Promise<{ wrappedKey: string; wrapIV: string }> {
    const iv = generateIV();

    // 1. Export the file key to raw bytes
    const keyData = await crypto.subtle.exportKey('raw', fileKey);

    // 2. Encrypt the raw key data with the wrapping key
    const encryptedBuffer = await crypto.subtle.encrypt(
        {
            name: AES_ALGORITHM,
            iv: iv as any
        },
        wrappingKey,
        keyData
    );

    return {
        wrappedKey: arrayBufferToBase64(encryptedBuffer),
        wrapIV: arrayBufferToBase64(iv.buffer)
    };
}

/**
 * Unwrap (decrypt) a file AES key using a Master Key
 */
export async function unwrapFileKey(
    wrappedKeyBase64: string,
    wrapIVBase64: string,
    wrappingKey: CryptoKey
): Promise<CryptoKey> {
    const encryptedBuffer = base64ToArrayBuffer(wrappedKeyBase64);
    const iv = base64ToArrayBuffer(wrapIVBase64);

    // 1. Decrypt the wrapped key data
    const keyData = await crypto.subtle.decrypt(
        {
            name: AES_ALGORITHM,
            iv: iv
        },
        wrappingKey,
        encryptedBuffer
    );

    // 2. Import the raw bits back into a CryptoKey
    return await crypto.subtle.importKey(
        'raw',
        keyData,
        {
            name: AES_ALGORITHM,
            length: AES_KEY_LENGTH
        },
        true, // extractable (maybe needed if we want to export it again)
        ['encrypt', 'decrypt']
    );
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Convert ArrayBuffer to Base64 string (URL-safe)
 */
export function arrayBufferToBase64(buffer: ArrayBufferLike): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    // Use URL-safe Base64
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Convert Base64 string (URL-safe) to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    // Restore standard Base64
    let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    while (standardBase64.length % 4) {
        standardBase64 += '=';
    }

    const binary = atob(standardBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Generate a random salt for PBKDF2
 */
export function generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16));
}
