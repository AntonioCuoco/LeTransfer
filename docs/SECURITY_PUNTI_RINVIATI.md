# Sicurezza — Punti rinviati a fine roadmap: #5 e #14

Documento di dettaglio per i due interventi di sicurezza che vengono **implementati per ultimi**, dopo tutte le altre fasi di [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md). Qui sono raccolti trade-off, cosa fare, quali file verranno toccati e perché, così da poter passare all'implementazione senza ulteriori decisioni aperte.

I due punti sono:
- **#14** — gli endpoint di upload multipart sono completamente non autenticati (`AuthorizationType: NONE`).
- **#5** — la chiave pubblica del destinatario di una condivisione non viene verificata (MITM lato server possibile).

---

## Premessa sull'ordine — possono davvero stare per ultimi?

| Punto | Rinviabile per ultimo? | Motivo |
|-------|------------------------|--------|
| **#5** | ✅ Sì, senza riserve | È puramente additivo (UI di fingerprint). Non blocca nulla, non rompe nulla di esistente, non apre rischi nuovi se rinviato. |
| **#14** | ⚠️ Sì per *dipendenze*, ma è una porta aperta **adesso** | Nessun altro intervento dipende da esso, quindi tecnicamente può stare per ultimo. Però finché resta `NONE` chiunque può abusare del bucket. Se lo si rinvia, applicare la **mitigazione-tampone** descritta sotto. |

**Raccomandazione:** #5 per ultimo va benissimo. #14 può stare per ultimo *solo* se nel frattempo si applica il tampone leggero (vedi sezione dedicata); altrimenti è meglio anticiparlo.

---

## #14 — Authorizer sugli endpoint di upload multipart

### Stato attuale (cosa c'è oggi)

- **API Gateway** ([multipart-upload-stack.yaml](../backend_infra/multipart-upload-stack.yaml)): i 4 metodi POST (`/upload/multipart/init`, `/urls`, `/complete`, `/abort`) hanno `AuthorizationType: NONE` (righe 256, 298, 340, 382). Nessun authorizer Cognito né Lambda.
- **Lambda** ([backend_infra/lambdas/](../backend_infra/lambdas/)): non validano alcun token; fanno solo `JSON.parse(event.body)` e si fidano del `userId` ricevuto nel body.
- **Frontend** ([useS3MultipartUpload.ts](../vue-app/src/composables/useS3MultipartUpload.ts)): invia già un `Authorization: Bearer` (via `getAuthToken`) e passa `userId` nel body della init — ma oggi nessuno dei due viene verificato lato server.
- **Path dei file:** `initiate-upload.js` costruisce `uploads/files/${userId}/${fileName}` a partire dal `userId` del body.

### Rischio concreto

Chiunque su internet, senza alcuna autenticazione, può:
1. chiamare `/init` con un `userId` arbitrario → ottenere un `uploadId`;
2. caricare contenuti nel bucket sotto il path di **qualunque** utente (storage abuse, costi AWS, hosting di materiale illecito sul tuo dominio/bucket);
3. far scrivere a `complete-upload` item in DynamoDB con `ownerUserId` arbitrario (inquinamento dati);
4. abortire upload altrui se ottiene `fileKey` + `uploadId`.

Questo è indipendente dall'E2E: la cifratura protegge la *confidenzialità* dei contenuti già caricati, non l'*integrità* del bucket né l'*abuso* delle risorse.

### Cosa fare (soluzione)

1. **Aggiungere un authorizer all'API Gateway** e impostare `AuthorizationType: COGNITO_USER_POOLS` (o `CUSTOM` per un Lambda authorizer) su tutti i metodi **POST**. I metodi **OPTIONS restano `NONE`** (il preflight CORS non va autenticato, altrimenti il browser non riesce a farlo).
2. **Le lambda non si fidano più del `userId` dal body:** lo derivano dai claim del token validato — `event.requestContext.authorizer.claims.sub`.
3. **Allineare la struttura del `fileKey`** al nuovo `userId` (vedi nota migrazione path sotto).
4. **Stringere il CORS** (è il #7): `Access-Control-Allow-Origin` da `*` all'origin del frontend, su tutti e 4 i lambda + le versioni inline nello YAML.

### File che verranno modificati e perché

| File | Modifica | Perché |
|------|----------|--------|
| [multipart-upload-stack.yaml](../backend_infra/multipart-upload-stack.yaml) | Aggiungere risorsa authorizer (`AWS::ApiGateway::Authorizer`) collegata alla User Pool; `AuthorizationType: COGNITO_USER_POOLS` su `InitMethod`, `UrlsMethod`, `CompleteMethod`, `AbortMethod` | Far validare il JWT da API Gateway prima di invocare la lambda |
| [initiate-upload.js](../backend_infra/lambdas/initiate-upload.js) | Leggere `sub` dai claim, ignorare `userId` del body, costruire `fileKey` dal `sub` | Impedire la scelta arbitraria del path utente |
| [complete-upload.js](../backend_infra/lambdas/complete-upload.js) | Usare il `sub` dai claim per `ownerUserId` | Evitare item DynamoDB con owner falsificato |
| [get-presigned-urls.js](../backend_infra/lambdas/get-presigned-urls.js), [abort-upload.js](../backend_infra/lambdas/abort-upload.js) | (Opzionale) verificare che il `fileKey` appartenga al `sub` del chiamante | Evitare azioni su upload altrui |
| Versioni inline `ZipFile` nello YAML | Allineare al codice `.js` (CORS + claims) | Le due copie del codice lambda divergono — vedi [update_lambdas.ps1](../backend_infra/update_lambdas.ps1) |
| [useS3MultipartUpload.ts](../vue-app/src/composables/useS3MultipartUpload.ts) | Eventuale rimozione del `userId` dal body (diventa ridondante) | Il server ora lo deriva dal token; tenerlo nel body è inutile e fuorviante |

### Decisioni da prendere (con trade-off)

- **Tipo di authorizer:**
  - *Cognito User Pool Authorizer* — nativo, zero codice, valida firma + pool + scadenza. **Consigliato se l'API dati usa già questo pattern** (replicarlo per coerenza).
  - *Lambda Authorizer* — più flessibile (logica custom, caching), ma più codice da mantenere. Solo se serve logica che Cognito non copre.
- **Struttura del `userId`/`fileKey`:** confermare che il nuovo identificatore è il `sub`. Se i file esistenti usano un `userId` diverso (es. email), i path vecchi e nuovi divergono → serve decidere se migrare i path o accettare la convivenza (i vecchi file restano accessibili tramite i record DynamoDB esistenti, i nuovi usano `sub`).

> ⚠️ **Prerequisito:** recuperare la configurazione dell'authorizer dell'**API dati** (non presente in questo repo — Console AWS o altra IaC). Quasi certamente esiste già un pattern Cognito funzionante da copiare, invece di inventarne uno nuovo.

### Mitigazione-tampone (se #14 viene davvero rinviato per ultimo)

Per non lasciare la porta completamente spalancata nel frattempo, una di queste, in ordine di efficacia:
1. **Restringere il CORS subito** (parte del #7): non blocca chiamate non-browser (curl), ma elimina l'abuso via browser da altri siti.
2. **WAF / rate limiting** su API Gateway: limita il volume di abuso.
3. **Bucket policy / lifecycle**: TTL aggressivo su `uploads/files/` non confermati, quota per prefisso.

Nessuno di questi sostituisce l'authorizer — sono solo argini temporanei.

### Test / criteri di accettazione

- [ ] Chiamata a `/init` **senza** `Authorization` → `401`.
- [ ] Chiamata con token valido di utente A che tenta `userId` = B nel body → il file finisce comunque sotto A (`sub` di A).
- [ ] Preflight `OPTIONS` → `200` senza token.
- [ ] Upload end-to-end dal frontend ancora funzionante (token valido).
- [ ] CORS: richiesta da origin non autorizzato → bloccata.

---

## #5 — Verifica della chiave pubblica del destinatario

### Il problema (MITM lato server)

Flusso di condivisione attuale ([useShareFile.ts:34-37](../vue-app/src/composables/useShareFile.ts#L34-L37), [useUserKeyPair.ts:120-126](../vue-app/src/composables/useUserKeyPair.ts#L120-L126)):

1. il client chiede al server la chiave pubblica RSA del destinatario;
2. il server ne restituisce una;
3. il client wrappa la file key AES con quella chiave.

Il passo 2 è fiducia cieca: **nessuno verifica che la chiave sia davvero del destinatario.** Un server compromesso/malevolo può restituire la *propria* chiave, decifrare la file key, e ri-wrapparla per il vero destinatario → MITM trasparente che annulla la garanzia E2E sulla condivisione.

È il **problema fondamentale della distribuzione delle chiavi** (PKI trust): non ha soluzione puramente tecnica, dipende da *da chi ci si vuole difendere*.

- Se il modello di minaccia **si fida del server** → il #5 è di fatto non-applicabile, basta documentarlo.
- Se si vuole difendersi anche da un **server compromesso/insider** → servono i meccanismi sotto.

### Opzioni con trade-off

| Opzione | Costo | Protezione | Contro |
|---------|-------|------------|--------|
| **1. Documentare il trust model** | ~0 | Nessuna (dichiara soltanto) | Non chiude il buco, lo esplicita |
| **2. Fingerprint + verifica out-of-band** | Medio | Reale contro server malevolo | Attrito UX; efficace solo se gli utenti verificano davvero |
| **3. Key transparency / directory firmata** | Alto | Robusta, senza azione utente | Complessa, richiede infra server dedicata |

### Cosa fare (decisione)

- **Opzione 1 — subito (anche fuori da questa fase):** scrivere nella security policy / nella guida E2E che la condivisione è "E2E in transito ma con distribuzione delle chiavi affidata al server". Onesto e gratuito.
- **Opzione 2 — questa fase:** UI di **fingerprint** (SHA-256 della JWK pubblica del destinatario, reso leggibile tipo `A1B2-C3D4-…` o "safety number" stile Signal), mostrato prima di confermare la condivisione, con invito a confrontarlo out-of-band. Resa **opt-in** per chi condivide dati sensibili.
- **Opzione 3 — roadmap lontana:** solo se "server non fidato" diventa un requisito esplicito del prodotto.

### File che verranno modificati e perché

| File | Modifica | Perché |
|------|----------|--------|
| [crypto.ts](../vue-app/src/utils/crypto.ts) | Nuova funzione `fingerprintPublicKey(jwk): string` — SHA-256 della JWK pubblica canonicalizzata, formattata leggibile | Primitiva per calcolare il fingerprint in modo deterministico |
| [useUserKeyPair.ts](../vue-app/src/composables/useUserKeyPair.ts) | `getRecipientPublicKey` ritorna anche il fingerprint della chiave ottenuta | Esporlo alla UI di condivisione |
| [ShareFileModal.vue](../vue-app/src/components/ShareFileModal.vue) | Mostrare il fingerprint del destinatario + checkbox/step "Ho verificato l'identità" prima di condividere | Punto di verifica out-of-band dell'utente |
| [GUIDA_UTENTE_E2E.md](GUIDA_UTENTE_E2E.md) | Sezione sul trust model e su come confrontare il fingerprint | Opzione 1, documentazione |

### Note di design

- Il fingerprint va calcolato su una **canonicalizzazione stabile** della JWK pubblica (campi ordinati): chiavi semanticamente identiche devono produrre lo stesso fingerprint su mittente e destinatario.
- Il destinatario deve poter **vedere il proprio fingerprint** (in Profilo/Impostazioni) per poterlo confrontare con quello che vede il mittente.
- La verifica è **consultiva**: non blocca la condivisione, ma la registra/segnala. (Bloccare creerebbe troppo attrito.)

### Test / criteri di accettazione

- [ ] Stessa chiave pubblica → stesso fingerprint su client diversi.
- [ ] Il mittente vede il fingerprint del destinatario prima di confermare.
- [ ] Il destinatario può leggere il proprio fingerprint nel profilo, e i due combaciano.
- [ ] La guida E2E descrive il trust model e la procedura di verifica.

---

*Documento creato il 2026-06-27 a corredo di [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md). Questi due punti vanno implementati per ultimi; #14 con la mitigazione-tampone nel frattempo se rinviato.*
