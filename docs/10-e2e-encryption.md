# 10. End-to-End Encryption (E2E)

## Panoramica

LeTransfer implementa un sistema di cifratura **End-to-End (E2E)** che garantisce la massima privacy e sicurezza dei dati. I file vengono cifrati direttamente nel browser dell'utente **prima** di essere inviati al server. Il server riceve e memorizza solo dati cifrati e non possiede mai le chiavi per decifrarli.

Solo l'utente che ha caricato il file (tramite la sua **Recovery Key**) e i destinatari autorizzati possono accedere al contenuto originale.

## Architettura del Sistema

### Componenti Principali

1. **Recovery Key (Chiave di Ripristino)**
   - Frase mnemonica di 24 parole (standard BIP39)
   - Generata localmente sul dispositivo dell'utente
   - **Mai inviata al server in chiaro**
   - Unico modo per recuperare l'accesso ai file cifrati

2. **Master Key (Chiave Principale)**
   - Derivata dalla Recovery Key usando PBKDF2 (100,000 iterazioni)
   - Mantenuta **solo in memoria** (mai persistita su disco)
   - Usata per cifrare/decifrare le chiavi dei file
   - Deve essere ri-derivata ad ogni sessione

3. **File Keys (Chiavi dei File)**
   - Ogni file ha una chiave AES-256-GCM unica
   - Generata localmente quando il file viene caricato
   - Cifrata (wrapped) con la Master Key prima di essere salvata
   - Salvata in DynamoDB in forma cifrata

### Flusso Completo

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SETUP INIZIALE (una volta per utente)                   │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Genera Recovery Key (24 parole BIP39)                  │ │
│ │         ↓                                               │ │
│ │ Deriva Master Key (PBKDF2 + Salt)                      │ │
│ │         ↓                                               │ │
│ │ Crea Verification Hash (cifra "VERIFY" con Master Key) │ │
│ │         ↓                                               │ │
│ │ Salva Salt + Verification Hash nel backend             │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 2. UPLOAD FILE                                              │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Genera File Key (AES-256-GCM) + IV                     │ │
│ │         ↓                                               │ │
│ │ Cifra il file con File Key                             │ │
│ │         ↓                                               │ │
│ │ Upload del file cifrato su S3 (Multipart)              │ │
│ │         ↓                                               │ │
│ │ Wrap File Key con Master Key                           │ │
│ │         ↓                                               │ │
│ │ Salva Wrapped File Key in DynamoDB                     │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 3. DOWNLOAD FILE                                            │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Recupera Wrapped File Key da DynamoDB                  │ │
│ │         ↓                                               │ │
│ │ Unwrap File Key con Master Key                         │ │
│ │         ↓                                               │ │
│ │ Download del file cifrato da S3                        │ │
│ │         ↓                                               │ │
│ │ Decifra il file con File Key                           │ │
│ │         ↓                                               │ │
│ │ Restituisci file originale all'utente                  │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Tecnologie Utilizzate

### Algoritmi Crittografici

| Componente | Algoritmo | Parametri |
|------------|-----------|-----------|
| **File Encryption** | AES-256-GCM | IV: 12 bytes (96 bit) |
| **Key Wrapping** | AES-256-GCM | IV: 12 bytes (96 bit) |
| **Key Derivation** | PBKDF2 | 100,000 iterazioni, SHA-256 |
| **Recovery Key** | BIP39 | 24 parole, 256 bit entropia |
| **User KeyPair** | RSA-OAEP | 4096 bit, SHA-256 |

### API Web

- **Web Crypto API**: Tutte le operazioni crittografiche usano le API native del browser
- **IndexedDB**: Storage locale per cache delle chiavi (opzionale)
- **Secure Random**: `crypto.getRandomValues()` per generazione IV e chiavi

## Tabelle DynamoDB

### UserRecoveryKeys

Memorizza i dati per la verifica della Recovery Key.

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `userId` | String (PK) | ID univoco dell'utente (Cognito sub) |
| `salt` | String (Base64) | Salt usato per PBKDF2 (16 bytes) |
| `verificationHash` | String (Base64) | IV + Ciphertext di "VERIFY" cifrato con Master Key |
| `createdAt` | String (ISO) | Data di creazione |
| `updatedAt` | String (ISO) | Data ultimo aggiornamento |

**Esempio:**
```json
{
  "userId": "us-east-1:abc123...",
  "salt": "kJ8xL2mN9pQ...",
  "verificationHash": "aB3cD4eF5g...",
  "createdAt": "2026-01-20T10:00:00Z"
}
```

### UserFileKeys

Memorizza le chiavi dei file cifrate con la Master Key.

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `userId` | String (PK) | ID univoco dell'utente |
| `s3Key` | String (SK) | Chiave S3 del file (es: `uploads/files/user123/file.pdf`) |
| `wrappedKey` | String (Base64) | File Key cifrata con Master Key |
| `fileIV` | String (Base64) | IV usato per cifrare il file (12 bytes) |
| `wrapIV` | String (Base64) | IV usato per cifrare la File Key (12 bytes) |
| `createdAt` | String (ISO) | Data di creazione |

**Esempio:**
```json
{
  "userId": "us-east-1:abc123...",
  "s3Key": "uploads/files/user123/document.pdf",
  "wrappedKey": "xY9zA1bC2d...",
  "fileIV": "mN3oP4qR5s...",
  "wrapIV": "tU6vW7xY8z...",
  "createdAt": "2026-01-20T10:30:00Z"
}
```

## Dettagli Implementazione

### 1. Setup Recovery Key

**File**: `src/components/RecoveryKeySetup.tsx`

```typescript
// 1. Genera Recovery Key (24 parole BIP39)
const mnemonic = await generateRecoveryKey();

// 2. Genera Salt casuale
const salt = crypto.getRandomValues(new Uint8Array(16));

// 3. Deriva Master Key
const masterKey = await deriveMasterKeyFromMnemonic(mnemonic, salt);

// 4. Crea Verification Hash
const iv = crypto.getRandomValues(new Uint8Array(12));
const dataToEncrypt = new TextEncoder().encode('VERIFY');
const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    dataToEncrypt
);

// 5. Combina IV + Ciphertext
const packed = new Uint8Array(12 + encryptedBuffer.byteLength);
packed.set(iv);
packed.set(new Uint8Array(encryptedBuffer), 12);

// 6. Salva nel backend
await setupRecoveryKey({
    salt: arrayBufferToBase64(salt),
    verificationHash: arrayBufferToBase64(packed)
});

// 7. Inizializza Master Key nel Context
initializeMasterKey(masterKey);
```

### 2. Upload File Cifrato

**File**: `src/hooks/useS3MultipartUpload.ts`

```typescript
// 1. Genera File Key
const encryptionKey = await generateAESKey();

// 2. Cifra il file
const { encrypted: encryptedBlob, iv: encryptionIV } = 
    await encryptFile(file, encryptionKey);

// 3. Upload blob cifrato su S3
await uploadToS3(encryptedBlob);

// 4. Wrap File Key con Master Key
const keyBase64 = await exportKeyToBase64(encryptionKey);
const ivBase64 = exportIVToBase64(encryptionIV);
await encryption.storeKey(s3Key, { key: keyBase64, iv: ivBase64 });
```

**Context**: `src/contexts/EncryptionContext.tsx`

```typescript
// storeKey: Wrap e salva la chiave
async storeKey(s3Key: string, keyData: EncryptionKeyData) {
    // 1. Importa File Key da Base64
    const fileKey = await crypto.subtle.importKey('raw', 
        base64ToArrayBuffer(keyData.key), 
        { name: 'AES-GCM', length: 256 }, 
        true, 
        ['encrypt', 'decrypt']
    );
    
    // 2. Wrap con Master Key
    const { wrappedKey, wrapIV } = await wrapFileKey(fileKey, masterKey);
    
    // 3. Salva in DynamoDB
    await saveFileKey({
        s3Key,
        wrappedKey,
        fileIV: keyData.iv,
        wrapIV
    });
}
```

### 3. Download File Cifrato

**File**: `src/hooks/useFileFromDynamoDB.ts`

```typescript
// 1. Recupera chiave cifrata
const keyData = await encryption.getKey(file.s3Key);

// 2. Importa chiave e IV
const key = await importKeyFromBase64(keyData.key);
const iv = importIVFromBase64(keyData.iv);

// 3. Download file cifrato
const response = await fetch(file.s3Url);
const encryptedBlob = await response.blob();

// 4. Decifra
const decryptedBlob = await decryptFile(encryptedBlob, key, iv);

// 5. Download file decifrato
downloadBlob(decryptedBlob, file.fileName);
```

### 4. Condivisione tramite Link

**Shared Links con Fragment URL (Zero-Knowledge)**

```typescript
// 1. Recupera File Key dal context
const keyData = await encryption.getKey(s3Key);

// 2. Genera URL con fragment
const url = `${baseUrl}/share/${publicToken}#key=${keyData.key}&iv=${keyData.iv}`;

// 3. Il fragment (#...) non viene mai inviato al server
// 4. Solo chi ha il link completo può decifrare il file
```

**Accesso al Link**:
```typescript
// 1. Estrai chiave dal fragment URL
const keyData = parseKeyFromHash(location.hash);

// 2. Importa chiave
const key = await importKeyFromBase64(keyData.key);
const iv = importIVFromBase64(keyData.iv);

// 3. Download e decifra
const encryptedBlob = await downloadFile(publicToken);
const decryptedBlob = await decryptFile(encryptedBlob, key, iv);
```

### 5. Condivisione via Email (RSA)

**Per utenti registrati con chiave pubblica RSA**:

```typescript
// 1. Recupera chiave pubblica del destinatario
const recipientPublicKey = await getPublicKey(recipientEmail);

// 2. Recupera File Key
const keyData = await encryption.getKey(s3Key);
const fileKey = await importKeyFromBase64(keyData.key);

// 3. Wrap File Key con chiave pubblica RSA
const wrappedKey = await wrapKeyWithPublicKey(fileKey, recipientPublicKey);

// 4. Invia al server
await shareFile({
    s3Key,
    targetEmail: recipientEmail,
    encryptedAESKey: wrappedKey,
    encryptionIV: keyData.iv
});
```

**Destinatario decifra**:
```typescript
// 1. Recupera wrapped key dal server
const { encryptedAESKey, encryptionIV } = await getSharedFile(shareId);

// 2. Unwrap con chiave privata RSA
const fileKey = await unwrapKeyWithPrivateKey(
    encryptedAESKey, 
    userPrivateKey
);

// 3. Decifra file
const decryptedBlob = await decryptFile(
    encryptedBlob, 
    fileKey, 
    importIVFromBase64(encryptionIV)
);
```

## Problemi Risolti

### 1. Master Key Non Inizializzata Dopo Setup ✅

**Problema**: Dopo aver configurato la Recovery Key, la Master Key derivata veniva scartata invece di essere passata al Context.

**Sintomo**: I file venivano caricati cifrati, ma la chiave non veniva salvata in DynamoDB, causando errori 404 al download.

**Soluzione**: 
- Aggiunto `useEncryption` hook in `RecoveryKeySetup.tsx`
- Chiamata a `initializeMasterKey(masterKey)` dopo setup riuscito
- File modificato: `src/components/RecoveryKeySetup.tsx` (linea 92)

### 2. Stale Closure in completeMultipartUpload ✅

**Problema**: La funzione `completeMultipartUpload` accedeva a `state.encryptionKey` e `state.encryptionIV` che erano snapshot vecchi dello state React.

**Sintomo**: Log mostravano `hasEncryption: false` anche se la chiave era stata generata.

**Soluzione**:
- Aggiunti `encryptionKeyRef` e `encryptionIVRef` come refs
- I valori vengono salvati nei refs quando generati
- `completeMultipartUpload` usa i refs che sono sempre aggiornati
- File modificato: `src/hooks/useS3MultipartUpload.ts`

### 3. TransferProvider Fuori da EncryptionProvider ✅

**Problema**: `TransferProvider` era wrappato in `App.tsx` prima di `EncryptionProvider` che era in `ProtectedRoutes`.

**Sintomo**: `useEncryptionOptional()` ritornava `null` perché il context non esisteva ancora.

**Soluzione**:
- Spostato `TransferProvider` dentro `ProtectedRoutes`
- Ora è correttamente wrappato da `EncryptionProvider`
- File modificati: `src/components/ProtectedRoutes/protectedRoutes.tsx`, `src/App.tsx`

## API Endpoints

### Recovery Key

#### POST /user/recovery-key
Salva salt e verification hash per un utente.

**Request:**
```json
{
  "salt": "base64_encoded_salt",
  "verificationHash": "base64_encoded_hash"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Recovery key configured successfully"
}
```

#### GET /user/recovery-key/status
Verifica se l'utente ha configurato la Recovery Key.

**Response:**
```json
{
  "hasRecoveryKey": true,
  "salt": "base64_encoded_salt",
  "verificationHash": "base64_encoded_hash"
}
```

### File Keys

#### POST /user/file-keys
Salva una chiave cifrata per un file.

**Request:**
```json
{
  "s3Key": "uploads/files/user123/file.pdf",
  "wrappedKey": "base64_wrapped_key",
  "fileIV": "base64_file_iv",
  "wrapIV": "base64_wrap_iv"
}
```

**Response:**
```json
{
  "success": true,
  "message": "File key saved successfully"
}
```

#### GET /user/file-keys/:s3Key
Recupera la chiave cifrata per un file specifico.

**Response:**
```json
{
  "success": true,
  "data": {
    "s3Key": "uploads/files/user123/file.pdf",
    "wrappedKey": "base64_wrapped_key",
    "fileIV": "base64_file_iv",
    "wrapIV": "base64_wrap_iv"
  }
}
```

#### GET /user/file-keys
Recupera tutte le chiavi cifrate dell'utente.

**Response:**
```json
{
  "success": true,
  "keys": [
    {
      "s3Key": "uploads/files/user123/file1.pdf",
      "wrappedKey": "...",
      "fileIV": "...",
      "wrapIV": "..."
    }
  ],
  "count": 1
}
```

#### DELETE /user/file-keys/:s3Key
Elimina una chiave cifrata.

**Response:**
```json
{
  "success": true,
  "message": "File key deleted successfully"
}
```

## Sicurezza

### Cosa il Server NON Può Fare

- ❌ **Leggere il contenuto dei file** - Sono cifrati con AES-256-GCM
- ❌ **Decifrare le chiavi dei file** - Sono wrapped con Master Key
- ❌ **Recuperare la Recovery Key** - Solo hash di verifica è salvato
- ❌ **Derivare la Master Key** - Non ha accesso alla Recovery Key
- ❌ **Accedere ai file senza autorizzazione** - Anche con accesso al database

### Cosa l'Utente DEVE Fare

- ✅ **Salvare la Recovery Key in un luogo sicuro** (password manager, carta)
- ✅ **Non condividere mai la Recovery Key** con nessuno
- ✅ **Inserire la Recovery Key su nuovi dispositivi** per accedere ai file
- ✅ **Fare backup della Recovery Key** in più luoghi sicuri
- ✅ **Non perdere la Recovery Key** - è l'unico modo per recuperare i file

### Limitazioni e Considerazioni

1. **Perdita Recovery Key**
   - Se perdi la Recovery Key, **tutti i file cifrati sono irrecuperabili**
   - Nemmeno il team di LeTransfer può recuperarli
   - È fondamentale fare backup sicuri

2. **Link Pubblici**
   - Chiunque possiede il link completo (con fragment) ha accesso al file
   - La sicurezza dipende dalla segretezza del link
   - Consigliato: usare scadenze brevi e password aggiuntive

3. **Performance**
   - La cifratura/decifratura avviene lato client
   - Per file molto grandi (>1GB), dipende dalla potenza del dispositivo
   - Browser moderni sono ottimizzati per Web Crypto API

4. **Compatibilità Browser**
   - Richiede supporto per Web Crypto API
   - Tutti i browser moderni sono supportati (Chrome, Firefox, Safari, Edge)
   - IE11 e browser molto vecchi non sono supportati

## Testing

### Test del Flusso Completo

#### 1. Setup Recovery Key
```
✓ Genera 24 parole BIP39
✓ Deriva Master Key con PBKDF2
✓ Crea Verification Hash
✓ Salva Salt + Hash nel backend
✓ Inizializza Master Key nel Context
```

#### 2. Upload File Cifrato
```
✓ Genera File Key (AES-256)
✓ Cifra file con File Key
✓ Upload blob cifrato su S3
✓ Wrap File Key con Master Key
✓ Salva Wrapped Key in DynamoDB
```

#### 3. Download File Cifrato
```
✓ Recupera Wrapped Key da DynamoDB
✓ Unwrap con Master Key
✓ Download blob cifrato da S3
✓ Decifra con File Key
✓ File identico all'originale
```

#### 4. Recovery su Nuovo Dispositivo
```
✓ Login su nuovo browser
✓ Inserisci Recovery Key
✓ Deriva Master Key
✓ Verifica con Verification Hash
✓ Accesso ai file precedenti
```

### Comandi di Test

```bash
# Test unitari
npm test src/utils/crypto.test.ts

# Test E2E
npm run test:e2e -- --spec=e2e/encryption.spec.ts

# Test manuale
npm run dev
# Segui il flusso: Setup → Upload → Download → Nuovo dispositivo
```

## Troubleshooting

### File Corrotto al Download

**Causa**: La chiave del file non è stata salvata o non può essere recuperata.

**Debug**:
1. Verifica che la Master Key sia inizializzata: `encryption.isLocked === false`
2. Controlla console per errori durante upload
3. Verifica DynamoDB: `UserFileKeys` deve contenere entry per l's3Key
4. Verifica che `encryptionKeyRef` sia popolato durante upload

**Soluzione**: Ricarica il file dopo aver verificato che la Recovery Key sia configurata.

### "Missing encryption data or context"

**Causa**: Il context di cifratura non è disponibile quando viene chiamato `storeKey`.

**Debug**:
1. Verifica che `EncryptionProvider` wrappa il componente
2. Controlla che `TransferProvider` sia dentro `EncryptionProvider`
3. Verifica che `useEncryptionOptional()` non ritorni `null`

**Soluzione**: Assicurati che la struttura dei provider sia corretta (vedi sezione "Problemi Risolti #3").

### Recovery Key Non Accettata

**Causa**: La Recovery Key inserita non corrisponde a quella configurata.

**Debug**:
1. Verifica di aver inserito tutte le 24 parole
2. Controlla l'ordine delle parole
3. Verifica che non ci siano spazi extra
4. Controlla che le parole siano lowercase

**Soluzione**: Riprova con attenzione. Se la Recovery Key è persa, i file non possono essere recuperati.

### Errore "Operation failed for an operation-specific reason"

**Causa**: Tentativo di decifratura con chiave o IV errati.

**Debug**:
1. Verifica che IV e chiave corrispondano al file
2. Controlla che il file non sia stato modificato
3. Verifica che la Master Key sia corretta

**Soluzione**: Assicurati di usare la Recovery Key corretta e che il file non sia corrotto.

## Manutenzione

### Backup della Recovery Key

Gli utenti dovrebbero essere incoraggiati a:
- Salvare la Recovery Key in un password manager cifrato
- Scrivere la Recovery Key su carta e conservarla in cassaforte
- Fare backup in più luoghi sicuri (casa, ufficio, cassetta di sicurezza)
- **Mai** fare screenshot o salvare in file non cifrati

### Rotazione delle Chiavi

Attualmente non supportata. Se implementata in futuro:

1. Generare nuova Recovery Key
2. Derivare nuova Master Key
3. Per ogni file:
   - Unwrap File Key con vecchia Master Key
   - Wrap File Key con nuova Master Key
   - Aggiornare record in DynamoDB
4. Aggiornare Salt e Verification Hash
5. Eliminare vecchia Master Key dalla memoria

### Monitoraggio

Metriche da monitorare:
- Tasso di successo upload cifrati
- Tasso di successo download decifrati
- Errori di decifratura
- Tempo medio cifratura/decifratura
- Utilizzo storage DynamoDB per chiavi

## Riferimenti

- [Web Crypto API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [BIP39 Specification](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)
- [AES-GCM - Wikipedia](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
- [PBKDF2 - Wikipedia](https://en.wikipedia.org/wiki/PBKDF2)
- [RSA-OAEP - RFC 3447](https://tools.ietf.org/html/rfc3447)

---

**Ultima modifica**: 2026-01-20  
**Versione**: 2.0.0  
**Autore**: Team LeTransfer
