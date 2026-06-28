# LeTransfer — Piano di consolidamento backend (eliminazione Lambda)

> Documento operativo per il **repo backend Express**. Descrive come eliminare le AWS Lambda
> e portare tutta la logica dentro l'unico backend Express su Fly.io, **mantenendo** S3,
> DynamoDB e Cognito. Pensato per essere passato al backend e usato come specifica di
> implementazione.
>
> Documento gemello lato infrastruttura/endpoint attuali: `docs/BACKEND_API_DOCS.md`.

---

## 0. Obiettivo e decisioni prese

- **Obiettivo**: un solo backend (l'Express esistente), niente più Lambda + API Gateway.
- **Si mantengono** i managed service AWS: **S3, DynamoDB, Cognito**. Nessuna migrazione a
  Postgres/Supabase.
- **Deploy**: Fly.io (lo stesso dove gira già l'Express).
- **Tabella condivisioni**: si **tiene `SharesTable`** (quella usata oggi dalle Lambda di
  sharing) → porting *lift-and-shift*, **zero migrazione dati**.
- Si porta **solo** il ramo `type: 'user'` della Lambda di share. Il ramo `type: 'link'` è
  **codice morto** (il frontend usa già l'Express `/api/shared-links` per i link pubblici).

---

## 1. Da dove nasce la dispersione (stato attuale)

Il frontend Vue oggi parla con **tre backend diversi**, via tre base URL in `vue-app/.env`:

| Env var (frontend) | Punta a | Cos'è | Destino |
|---|---|---|---|
| `VITE_API_URL` (`localhost:3000/api`) | **Express** | Backend principale | resta |
| `VITE_API_MULTIPART_URL` (`tawoe844yb.execute-api…`) | **Lambda + API GW** | Multipart upload | → Express, poi eliminare |
| `VITE_LAMBDA_URL` (`j9nttoaquk.execute-api…`) | **Lambda + API GW** | Sharing (`/share`, `/shared-files`) | → Express, poi eliminare |

**Obiettivo finale**: tutto su `VITE_API_URL`. I due gruppi Lambda diventano route Express.
> Lato frontend questo è **già stato fatto**: i 3 env var sono stati ridotti a `VITE_API_URL`
> (vedi §8). Manca l'implementazione lato backend.

---

## 2. Inventario Lambda da eliminare → route Express

| Lambda AWS (region `eu-central-1`) | Endpoint attuale | Diventa route Express |
|---|---|---|
| `LeTransferMultipartStack-InitiateUploadFunction-*` | `POST {multipart}/upload/multipart/init` | `POST /api/upload/multipart/init` |
| `LeTransferMultipartStack-GetPresignedUrlsFunction-*` | `POST {multipart}/upload/multipart/urls` | `POST /api/upload/multipart/urls` |
| `LeTransferMultipartStack-CompleteUploadFunction-*` | `POST {multipart}/upload/multipart/complete` | `POST /api/upload/multipart/complete` |
| `LeTransferMultipartStack-AbortUploadFunction-*` | `POST {multipart}/upload/multipart/abort` | `POST /api/upload/multipart/abort` |
| `dev-createShare` | `POST {lambda}/share` | `POST /api/share` |
| `dev-getSharedFiles` | `GET {lambda}/shared-files` | `GET /api/shared-files` |

> Le 4 multipart hanno il codice **inline** in `backend_infra/multipart-upload-stack.yaml`.
> Le 2 di sharing sono riportate integralmente in §6 (non erano nel repo).

### Lambda NON da portare
- `createShare` ramo `type: 'link'` → morto.
- `onFileShared`, `dev-accessLink` → da verificare separatamente (probabile legacy / trigger a
  evento); **non** invocate dai composable Vue attuali.
- `S3MultipartUploadStack-*` → **stack duplicato orfano** (vedi §7).

---

## 3. Specifica delle route da implementare

Convenzioni: auth via middleware `authenticateToken` (`req.user.sub`, `req.user.email`).
S3 bucket da `S3_BUCKET_NAME`. Riusare dove possibile `services/s3.js` / `services/dynamo.js`.

### 3.1 `POST /api/upload/multipart/init`
- **Auth**: 🔑 `authenticateToken`.
- **Body** (dal frontend): `{ fileName, fileType, fileSize, originalSize, isEncrypted, userId }`.
  > ⚠️ **Non fidarsi di `userId` dal body** (oggi le Lambda multipart sono `AuthorizationType: NONE`,
  > buco di sicurezza). Usare **`req.user.sub`** come owner.
- **Logica**: `CreateMultipartUploadCommand` su S3.
  - **Cambiare la struttura della key** rispetto alla Lambda: usare la convenzione del resto
    dell'app → `uploads/files/${sub}/${Date.now()}-${randomUUID()}-${safeName}`
    (la Lambda usava `uploads/files/${userId}/${fileName}`, che collide se carichi due volte lo
    stesso nome). La key generata viene restituita al client e usata per tutte le parti.
- **Risposta**: `{ uploadId, fileKey, existingParts? }`.
  `existingParts` opzionale (il frontend lo supporta per il resume); se non implementi il resume,
  ometterlo.

### 3.2 `POST /api/upload/multipart/urls`
- **Auth**: 🔑.
- **Body**: `{ fileKey, uploadId, partNumbers: number[] }`.
- **Verifica ownership**: `fileKey` deve iniziare con `uploads/files/${req.user.sub}/` → altrimenti `403`.
- **Logica**: per ogni part, presigned `UploadPartCommand` (`expiresIn: 3600`).
- **Risposta**: `{ urls: { [partNumber]: presignedUrl } }`.

### 3.3 `POST /api/upload/multipart/complete`
- **Auth**: 🔑.
- **Body**: `{ fileKey, uploadId, parts: [{PartNumber, ETag}], fileName, fileSize, fileType, userId, userEmail }`.
- **Verifica ownership**: prefisso `fileKey` come sopra.
- **Logica**:
  1. ordina `parts` per `PartNumber`, `CompleteMultipartUploadCommand`.
  2. **NUOVO (fix)**: scrivere i metadati su DynamoDB con `saveFileToDynamoDB` (la Lambda **non
     lo faceva**, perciò i file multipart non comparivano nelle liste). Record come da
     `BACKEND_API_DOCS.md §3.1` "File caricato":
     `{ id: uuid, s3Key: fileKey, fileName, fileSize, fileType, ownerUserId: sub, ownerEmail?,
        uploadedAt: ISO, status: 'uploaded', isShared: false }`.
- **Risposta**: `{ location, key }`.

### 3.4 `POST /api/upload/multipart/abort`
- **Auth**: 🔑.
- **Body**: `{ fileKey, uploadId }`. Verifica ownership prefisso.
- **Logica**: `AbortMultipartUploadCommand`. **Risposta**: `{ status: 'aborted' }`.

### 3.5 `POST /api/share`  (porting di `dev-createShare`, solo ramo `user`)
- **Auth**: 🔑. `ownerId = req.user.sub`.
  > ⚠️ La Lambda usava un **JWT Authorizer Cognito che verificava la firma**. L'Express oggi fa
  > solo `jwt.decode` (vedi BACKEND_API_DOCS §2.1). Per **non regredire** la sicurezza, qui serve
  > **verifica vera** del token (`aws-jwt-verify`). Vedi §5.
- **Body**: `{ s3Key, type: 'user', targetEmail, encryptedAESKey?, encryptionIV? }`.
- **Logica**:
  1. `HeadObjectCommand` su `s3Key` → metadati (`fileName` = ultimo segmento decodificato,
     `fileSize` = `ContentLength`, `fileType` = `ContentType`, `uploadedAt` = `LastModified`).
     404 se non esiste.
  2. Cognito `ListUsersCommand` filtrando `email = "targetEmail"` (UserPoolId da env) → `targetUserId`.
     404 se non trovato.
  3. `400` se `targetUserId === ownerId` (no self-share).
  4. `PutCommand` su **`SharesTable`**:
     `{ shareId: uuid, s3Key, ownerId, sharedToUserId: targetUserId, type: 'read',
        status: 'active', encryptedAESKey, encryptionIV, createdAt: ISO, ...fileMetadata }`.
- **Risposta**: `{ message: 'File shared successfully', shareId }`.
- **Compatibilità errori frontend** (`useShareFile.ts`): `404` = utente non trovato,
  `400` = self-share / messaggio custom.
- **Email** (opzionale): qui si può agganciare l'invio della notifica "file condiviso"
  → vedi `docs/EMAIL_NOTIFICHE.md`.

### 3.6 `GET /api/shared-files`  (porting di `dev-getSharedFiles`)
- **Auth**: 🔑. `userId = req.user.sub`.
- **Logica**:
  1. `QueryCommand` su **`SharesTable`**, `IndexName: 'SharedToUserIndex'`,
     `KeyConditionExpression: 'sharedToUserId = :uid'`.
  2. Per ogni share, costruisci l'oggetto file (vedi forma sotto).
- **Risposta**: `{ files: SharedFile[] }`.
- **Forma elemento** (compatibile col frontend):
  `{ shareId, s3Key, ownerId, encryptedAESKey, encryptionIV, sharedAt, fileName, fileSize,
     fileType, lastModified, name, size, type, uploadedAt, senderEmail, s3Url }`.

#### ⚠️ Due bug della Lambda da CORREGGERE nel porting (non ricopiarli)
1. **`s3Url` deve essere un presigned URL.** La Lambda lo costruiva come URL pubblico
   `https://${BucketName}.s3.amazonaws.com/${s3Key}` → con bucket **privato** (`ACL: private`)
   **non scarica**. Generare invece un `getSignedUrl(GetObjectCommand, { expiresIn: 3600 })`,
   come già fa il resto dell'Express.
2. **`senderEmail` è hardcoded** a `"user-id-placeholder"` → il mittente non si vede mai.
   Risolvere `ownerId → email` (Cognito `AdminGetUserCommand`, o la tabella `Users` del doc).

---

## 4. Montaggio in `app.js` ed env nuove

### Mounting (vedi BACKEND_API_DOCS §1)
```
/api/upload/multipart/*  → nuovo router multipart  (sotto uploadRoutes o router dedicato)
/api/share               → nuovo router share
/api/shared-files        → nuovo router share (stesso file)
```
> Attenzione alla rotta generica `/api/*` → `filesRoutes`: montare i router nuovi **prima** o con
> path espliciti per evitare che li intercetti.

### Variabili d'ambiente nuove (secret Fly)
| Var | Valore | Note |
|---|---|---|
| `SHARES_TABLE` | nome di `SharesTable` | tabella condivisioni utente→utente |
| `USER_POOL_ID` | (già presente) | usato anche da Cognito `ListUsers` |
| `S3_BUCKET_NAME` | (già presente) | |

### IAM (utente/role usato dall'Express su Fly)
Aggiungere i permessi che prima stavano sui ruoli Lambda:
- **S3**: `s3:CreateMultipartUpload`, `s3:UploadPart`, `s3:CompleteMultipartUpload`,
  `s3:AbortMultipartUpload`, `s3:ListMultipartUploadParts`, `s3:GetObject`, `s3:HeadObject` (incluso in GetObject).
- **DynamoDB**: `Query`/`PutItem`/`GetItem` su `SharesTable` **e** sul suo GSI `SharedToUserIndex`.
- **Cognito**: `cognito-idp:ListUsers` (e `AdminGetUser` se risolvi `senderEmail`).

---

## 5. Fix di sicurezza obbligatorio: verifica vera del JWT

Oggi `middleware/auth.js` fa `jwt.decode` **senza verificare la firma** → un token forgiato passa.
Le Lambda di sharing invece verificavano davvero (JWT Authorizer Cognito). Portandole sull'Express,
**non scendere** a quel livello: usare `aws-jwt-verify`.

```js
// middleware/auth.js (sostituzione di jwt.decode)
import { CognitoJwtVerifier } from "aws-jwt-verify";

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID,
  tokenUse: "id",
  clientId: process.env.COGNITO_CLIENT_ID,
});

export async function authenticateToken(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Access token required" });
  try {
    const payload = await verifier.verify(token);
    req.user = { sub: payload.sub, email: payload.email, name: payload.name };
    next();
  } catch {
    return res.status(403).json({ error: "Invalid token" });
  }
}
```
> Questa modifica vale per **tutte** le rotte 🔑, non solo per le nuove.

---

## 6. Codice sorgente Lambda di riferimento

### 6.1 `dev-createShare` (porta solo il ramo `type === 'user'`)

```js
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognitoClient = new CognitoIdentityProviderClient({});
const s3Client = new S3Client({});

export const handler = async (event) => {
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;   // → req.user.sub
  if (!userId) return { statusCode: 401, body: JSON.stringify({ message: "Unauthorized" }) };

  const { s3Key, targetEmail, type, encryptedAESKey, encryptionIV } = JSON.parse(event.body);
  if (!s3Key) return { statusCode: 400, body: JSON.stringify({ message: "S3 Key required" }) };

  // Verify file exists + metadata
  let headData;
  try {
    headData = await s3Client.send(new HeadObjectCommand({ Bucket: process.env.BucketName, Key: s3Key }));
  } catch (e) {
    return { statusCode: 404, body: JSON.stringify({ message: "File not found in S3" }) };
  }

  let fileName = s3Key.split('/').pop();
  try { fileName = decodeURIComponent(fileName); } catch {}
  const fileMetadata = {
    fileName,
    fileSize: headData.ContentLength,
    fileType: headData.ContentType,
    uploadedAt: headData.LastModified ? new Date(headData.LastModified).toISOString() : new Date().toISOString(),
  };

  if (type === 'user') {                                    // ← UNICO ramo da portare
    if (!targetEmail) return { statusCode: 400, body: JSON.stringify({ message: "Target email required" }) };

    const userResult = await cognitoClient.send(new ListUsersCommand({
      UserPoolId: process.env.UserPoolId,
      Filter: `email = "${targetEmail}"`,
      Limit: 1,
    }));
    if (!userResult.Users?.length) return { statusCode: 404, body: JSON.stringify({ message: "User not found" }) };

    const targetUserId = userResult.Users[0].Username;
    if (targetUserId === userId) return { statusCode: 400, body: JSON.stringify({ message: "Cannot share with yourself" }) };

    const shareId = randomUUID();
    await docClient.send(new PutCommand({
      TableName: process.env.SharesTable,
      Item: {
        shareId, s3Key, ownerId: userId, sharedToUserId: targetUserId,
        type: 'read', status: 'active', encryptedAESKey, encryptionIV,
        createdAt: new Date().toISOString(), ...fileMetadata,
      },
    }));
    return { statusCode: 200, body: JSON.stringify({ message: "File shared successfully", shareId }) };
  }
  // ramo type === 'link': IGNORARE (codice morto, gestito da /api/shared-links)
  return { statusCode: 400, body: JSON.stringify({ message: "Invalid share type" }) };
};
```

### 6.2 `dev-getSharedFiles` (correggere i 2 bug indicati in §3.6)

```js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const s3Client = new S3Client({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event) => {
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;   // → req.user.sub
  if (!userId) return { statusCode: 401, body: JSON.stringify({ message: "Unauthorized" }) };

  const result = await docClient.send(new QueryCommand({
    TableName: process.env.SharesTable,
    IndexName: "SharedToUserIndex",
    KeyConditionExpression: "sharedToUserId = :uid",
    ExpressionAttributeValues: { ":uid": userId },
  }));
  const shares = result.Items || [];
  if (shares.length === 0) return { statusCode: 200, body: JSON.stringify({ files: [] }) };

  const enriched = await Promise.all(shares.map(async (share) => {
    try {
      const base = {
        shareId: share.shareId, s3Key: share.s3Key, ownerId: share.ownerId,
        encryptedAESKey: share.encryptedAESKey, encryptionIV: share.encryptionIV,
        sharedAt: share.createdAt,
        // BUG #1: era URL pubblico → usare presigned getSignedUrl(GetObjectCommand, {expiresIn:3600})
        s3Url: `https://${process.env.BucketName}.s3.amazonaws.com/${share.s3Key}`,
        // BUG #2: hardcoded → risolvere ownerId→email via Cognito AdminGetUser / tabella Users
        senderEmail: "user-id-placeholder",
      };
      if (share.fileName && share.fileSize) {
        return { ...base, fileName: share.fileName, fileSize: share.fileSize,
          fileType: share.fileType || 'application/octet-stream',
          lastModified: share.uploadedAt || share.createdAt,
          name: share.fileName, size: share.fileSize,
          type: share.fileType || 'application/octet-stream',
          uploadedAt: share.uploadedAt || share.createdAt };
      }
      // fallback legacy: HeadObject su S3
      const headData = await s3Client.send(new HeadObjectCommand({ Bucket: process.env.BucketName, Key: share.s3Key }));
      let fileName = share.s3Key.split('/').pop();
      try { fileName = decodeURIComponent(fileName); } catch {}
      return { ...base, fileName, fileSize: headData.ContentLength, fileType: headData.ContentType,
        lastModified: headData.LastModified, name: fileName, size: headData.ContentLength,
        type: headData.ContentType, uploadedAt: headData.LastModified };
    } catch (e) { return null; }
  }));

  return { statusCode: 200, body: JSON.stringify({ files: enriched.filter(Boolean) }) };
};
```

### 6.3 Multipart (4 funzioni)
Codice inline in `backend_infra/multipart-upload-stack.yaml` (handler `Initiate`, `GetPresignedUrls`,
`Complete`, `Abort`). Portarli applicando: **auth** (`req.user.sub`), **ownership** sul prefisso
key, e **`saveFileToDynamoDB`** nel `complete` (§3.3).

---

## 7. Pulizia infrastruttura

- **Stack multipart duplicato**: nella Console Lambda esistono sia `S3MultipartUploadStack-*` sia
  `LeTransferMultipartStack-*`. Solo uno è dietro `VITE_API_MULTIPART_URL` (`tawoe844yb`). Dopo il
  porting, individuare quale stack è collegato e **cancellare entrambi** (lo stack via
  CloudFormation `delete-stack`), più l'API Gateway `j9nttoaquk` delle share.
- Verificare se `onFileShared` / `dev-accessLink` sono ancora referenziati da qualcosa prima di
  rimuoverli.

### Notifiche email
La notifica email "file condiviso" (ex template React Email, rimosso con la React) va riprogettata
lato backend. Documento dedicato: **`docs/EMAIL_NOTIFICHE.md`**.

---

## 8. Modifiche lato FRONTEND (repo Vue) — GIÀ FATTE

Stato: ✅ completate in `vue-app/`.

1. **`vue-app/.env`**: rimosse `VITE_API_MULTIPART_URL` e `VITE_LAMBDA_URL` (resta solo `VITE_API_URL`).
2. **`vue-app/env.d.ts`**: rimossi i tipi dei due env var.
3. **`vue-app/src/composables/useShareFile.ts`**: `API_BASE_URL = VITE_API_URL` → i path `/share` e
   `/shared-files` diventano `/api/share`, `/api/shared-files`.
4. **`vue-app/src/pages/Homepage.vue`**: `apiMultipartUrl = VITE_API_URL` → multipart su
   `/api/upload/multipart/*`.
5. **CORS Express** (da fare lato backend): aggiungere l'origine di produzione del frontend alla whitelist in `app.js`.

---

## 9. Checklist migrazione

- [ ] `middleware/auth.js`: verifica vera JWT con `aws-jwt-verify` (§5).
- [ ] Router multipart: `init` / `urls` / `complete` / `abort` con auth + ownership (§3.1–3.4).
- [ ] `complete` scrive metadati con `saveFileToDynamoDB` (§3.3).
- [ ] `POST /api/share` (ramo `user`) → `SharesTable` (§3.5).
- [ ] `GET /api/shared-files` → query GSI `SharedToUserIndex`, con i 2 fix (§3.6).
- [ ] Env nuove (`SHARES_TABLE`) + IAM (S3 multipart, Dynamo `SharesTable`+GSI, Cognito) (§4).
- [ ] Mount in `app.js` senza collisioni con `/api/*` (§4).
- [ ] (opz.) Notifiche email — `docs/EMAIL_NOTIFICHE.md`.
- [ ] Test end-to-end dal frontend (tutto su `VITE_API_URL`).
- [x] Frontend: consolidare i 3 env var → 1 (§8).
- [ ] Cancellare stack/Gateway Lambda orfani (§7).
