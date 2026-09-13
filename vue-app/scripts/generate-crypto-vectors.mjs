#!/usr/bin/env node
/**
 * Generatore dei vettori di test del nucleo crittografico (roadmap O3.1).
 *
 *   node scripts/generate-crypto-vectors.mjs           aggiunge solo le sezioni mancanti
 *   node scripts/generate-crypto-vectors.mjs --force   riscrive TUTTO (vedi sotto: quasi mai)
 *
 * ── Perché con `node:crypto` e non con il nostro codice ─────────────────────────
 * Un vettore prodotto dalla stessa implementazione che deve verificare prova solo che il
 * codice è d'accordo con sé stesso. Qui ogni byte atteso è calcolato da **OpenSSL** (via
 * `node:crypto`), a partire dalla specifica in `src/crypto/README.md`. Il test
 * `src/crypto/vectors.test.ts` controlla che la nostra implementazione Web Crypto ottenga gli
 * stessi byte.
 *
 * ⚠️ **Unica eccezione dichiarata: X-Wing.** `node:crypto` non implementa ML-KEM, quindi le
 * sezioni v2 usano `@noble/post-quantum` per la sola parte X-Wing — la stessa libreria del
 * client. Per non ridurre il controllo a una tautologia, **prima** di usarla il generatore le fa
 * riprodurre i vettori ufficiali del draft IETF (`scripts/data/xwing-draft-10-vectors.json`), e
 * si ferma se non ci riesce. Tutto il resto del formato v2 (RSA-OAEP, HKDF, AES-GCM, SHA-256)
 * resta calcolato da OpenSSL.
 *
 * ── Gli input sono pubblici ─────────────────────────────────────────────────────
 * Chiavi, IV e sale sono derivati da etichette fisse con SHA-256: deterministici, riproducibili,
 * e ovviamente **non segreti**. L'unica eccezione è la coppia RSA, che OpenSSL non genera da un
 * seme: è casuale e resta scritta nel file.
 *
 * ⚠️ **I vettori sono la specifica: non si rigenerano.** Un vettore che cambia significa che il
 * formato è cambiato, e i file già cifrati potrebbero non riaprirsi più. Per questo lo script, se
 * il file esiste, **lo carica così com'è e aggiunge soltanto le sezioni che mancano**: un formato
 * nuovo è una sezione nuova. `--force` riscrive tutto e va usato solo prima che esista un solo
 * file cifrato in produzione.
 */

import {
  createCipheriv,
  createHash,
  createPublicKey,
  generateKeyPairSync,
  hkdfSync,
  pbkdf2Sync,
  publicEncrypt,
  constants,
} from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ml_kem768_x25519 as xwing } from '@noble/post-quantum/hybrid.js'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../src/crypto/vectors/crypto-vectors.json')
const WORDLIST_TS = resolve(here, '../src/crypto/bip39-wordlist.ts')
const XWING_DRAFT = resolve(here, 'data/xwing-draft-10-vectors.json')
const OFFICIAL_WORDLIST_SHA256 = '2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda'
const FORCE = process.argv.includes('--force')

// ── Utilità ──────────────────────────────────────────────────────────────────────
const b64u = (bytes) => Buffer.from(bytes).toString('base64url')
const fromB64u = (value) => Buffer.from(value, 'base64url')
const sha256 = (...parts) => createHash('sha256').update(Buffer.concat(parts.map((part) => Buffer.from(part)))).digest()

/** Byte deterministici da un'etichetta: SHA-256 a catena. Pubblici per costruzione. */
function fixed(label, length) {
  let out = Buffer.alloc(0)
  for (let i = 0; out.length < length; i++) {
    out = Buffer.concat([out, createHash('sha256').update(`novren-vectors/${label}/${i}`).digest()])
  }
  return out.subarray(0, length)
}

/** AES-256-GCM come lo usa il nucleo: ciphertext seguito dal tag da 16 byte. */
function aesGcm(key, iv, plaintext, aad) {
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  if (aad !== undefined) cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([ciphertext, cipher.getAuthTag()])
}

// ── Wordlist e BIP39 (implementazione indipendente) ───────────────────────────────
const wordlist = [...readFileSync(WORDLIST_TS, 'utf8').matchAll(/"([a-z]+)"/g)].map((match) => match[1])
const wordlistHash = createHash('sha256').update(`${wordlist.join('\n')}\n`).digest('hex')
if (wordlist.length !== 2048 || wordlistHash !== OFFICIAL_WORDLIST_SHA256) {
  throw new Error('La wordlist del progetto non è quella ufficiale BIP39: i vettori non si generano su una lista sbagliata.')
}

function entropyToMnemonic(entropy) {
  const checksumBits = entropy.length / 4 // 8 bit per 32 byte di entropia
  const hash = createHash('sha256').update(entropy).digest()
  let bits = [...entropy].map((byte) => byte.toString(2).padStart(8, '0')).join('')
  bits += hash[0].toString(2).padStart(8, '0').slice(0, checksumBits)
  return bits.match(/.{11}/g).map((chunk) => wordlist[parseInt(chunk, 2)]).join(' ')
}

// ═════════════════════════════════════════════════════════════════════════════════
// Versione 1 — i formati esistenti. Calcolati solo se il file non esiste (o con --force).
// ═════════════════════════════════════════════════════════════════════════════════
function buildVersion1() {
  // Vettori ufficiali BIP39 (Trezor, entropia a 256 bit). Se il nostro calcolo non li
  // riproduce, il generatore si ferma: meglio nessun vettore che un vettore sbagliato.
  const BIP39_OFFICIAL = [
    {
      entropy: '0000000000000000000000000000000000000000000000000000000000000000',
      mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art',
    },
    {
      entropy: '7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f',
      mnemonic: 'legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title',
    },
    {
      entropy: '8080808080808080808080808080808080808080808080808080808080808080',
      mnemonic: 'letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic bless',
    },
    {
      entropy: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      mnemonic: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo vote',
    },
  ]
  for (const vector of BIP39_OFFICIAL) {
    const computed = entropyToMnemonic(Buffer.from(vector.entropy, 'hex'))
    if (computed !== vector.mnemonic) throw new Error(`BIP39 non riproduce il vettore ufficiale ${vector.entropy}: ${computed}`)
  }

  // 1. File a chunk, formato v2
  const chunkKey = fixed('chunked/key', 32)
  const chunkSize = 20
  const chunkPlaintext = Buffer.from('Novren: vettore di prova del formato v2 a chunk.', 'utf8') // 48 byte → 20 + 20 + 8
  const chunks = []
  for (let index = 0; index * chunkSize < chunkPlaintext.length; index++) {
    const iv = fixed(`chunked/iv/${index}`, 12)
    const plain = chunkPlaintext.subarray(index * chunkSize, (index + 1) * chunkSize)
    chunks.push({ index, iv: b64u(iv), framed: b64u(Buffer.concat([iv, aesGcm(chunkKey, iv, plain, `chunk-${index}`)])) })
  }

  // 2. Nome del file cifrato, nameVersion 2
  const nameKey = fixed('filename/key', 32)
  const fileNames = [
    'Ricorso_Rossi_vs_Bianchi_udienza_12_marzo.pdf',
    'fattura 2026 — €1.200,00 ✓.pdf',
    '写真 📷.jpg',
  ].map((name, i) => {
    const iv = fixed(`filename/iv/${i}`, 12)
    return { name, iv: b64u(iv), blob: b64u(Buffer.concat([iv, aesGcm(nameKey, iv, Buffer.from(name, 'utf8'), 'filename')])) }
  })

  // 3. Chiave nel frammento del link
  const linkKey = b64u(fixed('link/key', 32))
  const linkIv = b64u(fixed('link/iv', 12))

  // 4. Chiave del file wrappata con la master key (AAD = s3Key), e formato pre-#9
  const wrappingKey = fixed('file-key-wrap/wrapping-key', 32)
  const wrappedFileKey = fixed('file-key-wrap/file-key', 32)
  const s3Key = 'uploads/files/sub-dei-vettori/1700000000000-uuid-contratto.pdf'
  const wrapIv = fixed('file-key-wrap/iv', 12)
  const legacyWrapIv = fixed('file-key-wrap/legacy-iv', 12)

  // 5. Chiave di recupero → master key → blob di verifica
  const recoveryMnemonic = entropyToMnemonic(fixed('recovery/entropy', 32))
  const recoverySalt = fixed('recovery/salt', 16)
  const RECOVERY_ITERATIONS = 100_000
  const masterKey = pbkdf2Sync(recoveryMnemonic, recoverySalt, RECOVERY_ITERATIONS, 32, 'sha256')
  const verificationIv = fixed('recovery/verification-iv', 12)

  // 6. RSA-OAEP (SHA-256) fra utenti + impronta RFC 7638
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 4096, publicExponent: 0x10001 })
  const publicKeyJwk = publicKey.export({ format: 'jwk' })
  const privateKeyJwk = privateKey.export({ format: 'jwk' })
  const rsaFileKey = fixed('rsa-oaep/file-key', 32)
  const rsaWrapped = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, rsaFileKey)
  const thumbprint = createHash('sha256').update(`{"e":"${publicKeyJwk.e}","kty":"RSA","n":"${publicKeyJwk.n}"}`).digest('hex')

  // 7. Backup della chiave privata cifrato con la master key
  const backupIv = fixed('keypair-backup/iv', 12)
  const backupPlaintext = Buffer.from(JSON.stringify(privateKeyJwk), 'utf8')

  return {
    about:
      'Vettori di test del nucleo crittografico di Novren. Ogni byte atteso è calcolato con node:crypto (OpenSSL), ' +
      'non con il codice che li verifica. Chiavi e IV sono di prova e pubblici. Specifica: src/crypto/README.md.',
    version: 1,
    encoding: 'Byte in base64url senza padding (come arrayBufferToBase64), testo in UTF-8. Entropia BIP39 in esadecimale.',

    chunkedFileV2: {
      spec: 'Ogni chunk: [IV 12 byte][ciphertext + tag GCM 16 byte], AES-256-GCM, AAD = "chunk-<indice>". Oggetto = chunk concatenati.',
      key: b64u(chunkKey),
      chunkSize,
      plaintext: b64u(chunkPlaintext),
      chunks,
      object: b64u(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.framed, 'base64url')))),
    },

    fileNameV2: {
      spec: 'base64url di [IV 12 byte][ciphertext + tag], AES-256-GCM con la chiave del file, AAD = "filename".',
      key: b64u(nameKey),
      cases: fileNames,
    },

    linkFragment: {
      spec: '#key=<chiave AES raw>&iv=<IV>, entrambi base64url e passati da encodeURIComponent.',
      key: linkKey,
      iv: linkIv,
      fragment: `#key=${encodeURIComponent(linkKey)}&iv=${encodeURIComponent(linkIv)}`,
    },

    fileKeyWrap: {
      spec: 'AES-256-GCM(chiave che avvolge, chiave del file raw), AAD = s3Key. Formato pre-#9: stessa cosa senza AAD, ancora da leggere.',
      wrappingKey: b64u(wrappingKey),
      fileKey: b64u(wrappedFileKey),
      s3Key,
      wrapIV: b64u(wrapIv),
      wrappedKey: b64u(aesGcm(wrappingKey, wrapIv, wrappedFileKey, s3Key)),
      legacyWrapIV: b64u(legacyWrapIv),
      legacyWrappedKey: b64u(aesGcm(wrappingKey, legacyWrapIv, wrappedFileKey)),
    },

    bip39: {
      spec: 'Wordlist inglese ufficiale BIP39 (SHA-256 ' + OFFICIAL_WORDLIST_SHA256 + '). Entropia 256 bit → 24 parole.',
      official: BIP39_OFFICIAL,
    },

    recoveryKey: {
      spec:
        'master key = PBKDF2-SHA256(mnemonica in UTF-8, sale, 100000 iterazioni, 32 byte). ' +
        'verificationHash = base64url di [IV 12 byte][AES-256-GCM(master key, "VERIFY") + tag].',
      entropy: fixed('recovery/entropy', 32).toString('hex'),
      mnemonic: recoveryMnemonic,
      salt: b64u(recoverySalt),
      iterations: RECOVERY_ITERATIONS,
      masterKey: b64u(masterKey),
      verificationIV: b64u(verificationIv),
      verificationHash: b64u(Buffer.concat([verificationIv, aesGcm(masterKey, verificationIv, Buffer.from('VERIFY', 'utf8'))])),
    },

    rsaOaep: {
      spec:
        'RSA-OAEP, modulo 4096, hash SHA-256 (OAEP e MGF1). wrappedKey = cifratura della chiave del file raw. ' +
        'Non deterministico: si verifica solo la decifratura. thumbprint = JWK Thumbprint RFC 7638 in esadecimale.',
      publicKeyJwk,
      privateKeyJwk,
      thumbprint,
      fileKey: b64u(rsaFileKey),
      wrappedKey: b64u(rsaWrapped),
    },

    keyPairBackup: {
      spec:
        'AES-256-GCM(master key di recoveryKey, JSON della chiave privata JWK di rsaOaep), senza AAD. ' +
        'La serializzazione JSON non è canonica: si verifica solo la decifratura.',
      iv: b64u(backupIv),
      encryptedPrivateKey: b64u(aesGcm(masterKey, backupIv, backupPlaintext)),
    },
  }
}

const vectors = existsSync(OUT) && !FORCE ? JSON.parse(readFileSync(OUT, 'utf8')) : buildVersion1()
const added = []

// ═════════════════════════════════════════════════════════════════════════════════
// Versione 2 — post-quantum (O2.3). Sezioni aggiunte, quelle v1 restano intatte.
// ═════════════════════════════════════════════════════════════════════════════════

// X-Wing si usa solo dopo che ha riprodotto i vettori ufficiali del draft.
const xwingDraft = JSON.parse(readFileSync(XWING_DRAFT, 'utf8'))
for (const [i, v] of xwingDraft.vectors.entries()) {
  const hex = (bytes) => Buffer.from(bytes).toString('hex')
  const H = (value) => Uint8Array.from(Buffer.from(value, 'hex'))
  const { cipherText, sharedSecret } = xwing.encapsulate(H(v.pk), H(v.eseed))
  const ok =
    hex(xwing.getPublicKey(H(v.seed))) === v.pk &&
    hex(cipherText) === v.ct &&
    hex(sharedSecret) === v.ss &&
    hex(xwing.decapsulate(H(v.ct), H(v.sk))) === v.ss
  if (!ok) throw new Error(`X-Wing non riproduce il vettore ufficiale ${i} del draft: i vettori v2 non si generano.`)
}

if (!vectors.xwingDraft10) {
  vectors.xwingDraft10 = {
    spec: 'X-Wing (ML-KEM-768 + X25519). Vettori trascritti verbatim dal draft, in esadecimale.',
    source: xwingDraft.source,
    vectors: xwingDraft.vectors,
  }
  added.push('xwingDraft10')
}

const LABEL = 'novren/key-wrap/v2'
const rsaPublic = createPublicKey({ key: vectors.rsaOaep.publicKeyJwk, format: 'jwk' })
const xwingSeed = fixed('hybrid/xwing-seed', 32)
const xwingPublicKey = Buffer.from(xwing.getPublicKey(Uint8Array.from(xwingSeed)))

if (!vectors.hybridKeyWrapV2) {
  const rsaSecret = fixed('hybrid/rsa-secret', 32)
  const eseed = fixed('hybrid/eseed', 64)
  const iv = fixed('hybrid/iv', 12)
  const fileKey = fixed('hybrid/file-key', 32)

  const cRsa = publicEncrypt({ key: rsaPublic, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, rsaSecret)
  const { cipherText, sharedSecret } = xwing.encapsulate(Uint8Array.from(xwingPublicKey), Uint8Array.from(eseed))
  const cXWing = Buffer.from(cipherText)
  const kek = Buffer.from(hkdfSync('sha256', Buffer.concat([rsaSecret, Buffer.from(sharedSecret)]), Buffer.from(LABEL, 'utf8'), sha256(cRsa, cXWing, xwingPublicKey), 32))
  const sealed = aesGcm(kek, iv, fileKey, LABEL)

  vectors.hybridKeyWrapV2 = {
    spec:
      'blob = "v2." b64u(cRsa) "." b64u(cXWing) "." b64u(iv) "." b64u(sealed). ' +
      'cRsa = RSA-OAEP-SHA256(pk RSA di rsaOaep, rsaSecret). (cXWing, ss) = X-Wing.EncapsulateDerand(pk X-Wing, eseed). ' +
      'KEK = HKDF-SHA256(ikm = rsaSecret || ss, salt = "novren/key-wrap/v2", info = SHA-256(cRsa || cXWing || pk X-Wing), 32 byte). ' +
      'sealed = AES-256-GCM(KEK, iv, fileKey, AAD = "novren/key-wrap/v2"). La parte RSA non è deterministica in Web Crypto: ' +
      'si verifica la decifratura del blob e, a parità di casualità, la parte X-Wing e l\'IV.',
    rsaKeys: 'rsaOaep',
    xwingSeed: b64u(xwingSeed),
    xwingPublicKey: b64u(xwingPublicKey),
    fileKey: b64u(fileKey),
    rsaSecret: b64u(rsaSecret),
    eseed: b64u(eseed),
    iv: b64u(iv),
    kek: b64u(kek),
    blob: ['v2', b64u(cRsa), b64u(cXWing), b64u(iv), b64u(sealed)].join('.'),
  }
  added.push('hybridKeyWrapV2')
}

if (!vectors.xwingSeedBackup) {
  const iv = fixed('xwing-seed-backup/iv', 12)
  vectors.xwingSeedBackup = {
    spec: 'AES-256-GCM(master key di recoveryKey, seme X-Wing di hybridKeyWrapV2, AAD = "novren/xwing-seed-backup/v1").',
    seedIV: b64u(iv),
    encryptedSeed: b64u(aesGcm(fromB64u(vectors.recoveryKey.masterKey), iv, xwingSeed, 'novren/xwing-seed-backup/v1')),
  }
  added.push('xwingSeedBackup')
}

if (!vectors.hybridFingerprint) {
  const rsa = vectors.rsaOaep.thumbprint
  const xw = sha256(xwingPublicKey).toString('hex')
  vectors.hybridFingerprint = {
    spec: 'SHA-256 di {"rsa":"<RFC 7638 hex>","xwing":"<SHA-256 della chiave X-Wing, hex>"} in UTF-8, JSON canonico. Senza X-Wing: RFC 7638.',
    rsaKeys: 'rsaOaep',
    xwingPublicKey: b64u(xwingPublicKey),
    thumbprint: createHash('sha256').update(`{"rsa":"${rsa}","xwing":"${xw}"}`, 'utf8').digest('hex'),
  }
  added.push('hybridFingerprint')
}

vectors.version = Math.max(vectors.version ?? 1, 2)

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(vectors, null, 2)}\n`)
console.log(`✅ ${OUT}`)
console.log(added.length ? `   sezioni aggiunte: ${added.join(', ')}` : '   nessuna sezione nuova: il file era già completo.')
console.log('   BIP39 e X-Wing riproducono i rispettivi vettori ufficiali.')
