# Migrazione storage: AWS S3 → Cloudflare R2

Documento di valutazione e piano operativo per spostare **solo lo storage dei file** da S3 a
Cloudflare R2, con l'obiettivo di **azzerare i costi di egress**.

> **Stato (2026-08-12): cutover eseguito.** Il codice era già pronto da tempo (`config/aws.js` fa lo
> switch automatico quando le 4 env R2 sono presenti) e l'infra è stata completata, `R2_JURISDICTION=eu`
> incluso — vedi [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md) voce 7.
>
> Cosa resta di questo documento: i **conti dei costi** (§2), le **prove da eseguire** dopo il cutover
> (multipart completo, presigned GET, `HeadObject`) e la nota sulla CORS di produzione, che è ancora
> aperta ([DA_CONTROLLARE_QUANDO.md](DA_CONTROLLARE_QUANDO.md)).

> **In una riga:** un'app di file transfer è download-heavy → l'egress è il costo dominante. R2 ha
> **egress $0** ed è **S3-compatibile**, quindi si migra lo storage con poco sforzo e **senza toccare
> l'E2E**. DynamoDB, Cognito ed Express restano dove sono.

---

## 1. Obiettivo e scope

**Obiettivo:** eliminare i costi di egress S3 sui download dei file.

**IN scope:** solo lo **storage oggetti** (i file cifrati). S3 → R2.

**FUORI scope (restano su AWS/Fly):**
- **DynamoDB** (metadati file, `SharesTable`, file-keys, keypair-backup, recovery-key);
- **Cognito** (autenticazione);
- **Express su Fly.io** (backend).

Motivo: l'egress si paga sui **download dei file** (S3), non su DynamoDB né Cognito. Spostare solo lo
storage cattura tutto il risparmio con rischio minimo. Migrare DB e auth è molto lavoro e **non serve**
all'obiettivo (Cognito in particolare non ha un equivalente diretto su Cloudflare).

---

## 2. Perché R2 conviene (per questo caso d'uso)

| | AWS S3 | Cloudflare R2 |
|---|---|---|
| **Egress** | ~$0.09/GB | **$0** |
| Storage | ~$0.023/GB/mese | ~$0.015/GB/mese |
| Scritture (Class A) | economiche | ~$4.50 / milione |
| Letture (Class B) | economiche | ~$0.36 / milione |
| Free tier | limitato | 10 GB storage + operazioni generose |

*(Prezzi indicativi — ⚠️ verificare i valori correnti prima di decidere, cambiano.)*

**Bonus R2:** puoi mettere un **dominio custom + CDN Cloudflare** davanti al bucket per i download →
caching all'edge, **egress sempre gratis**. Utile soprattutto per i **link pubblici**.

---

## 3. Sicurezza — cosa cambia (poco)

- **L'E2E non cambia per niente.** La cifratura è lato client: R2 (come S3) conserva **solo
  ciphertext**. Il provider è già "non fidato" per design → cambiarlo non indebolisce nulla.
- **Presigned URL**: R2 li supporta (scadenza + scope), stesso modello di sicurezza di S3.
- **Access control**: token R2 con permessi scoped (analogo a IAM S3). Usare un token dedicato con i soli
  permessi necessari (read/write sul bucket).
- **CORS**: da configurare su R2 per consentire upload/download diretti dal browser (origin frontend).
- ⚠️ **Data residency**: R2 ha "location hints"/jurisdiction ma meno granulare delle region AWS. Se hai
  requisiti di residenza dati (es. solo UE), **verificalo** prima.

---

## 4. Impatto sul codice

R2 espone **API S3-compatibile**: si continua a usare `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner`.
Cambia essenzialmente **come si istanzia il client**.

**Da (S3):**
```js
const s3 = new S3Client({}) // region/credenziali da ambiente AWS
```

**A (R2):**
```js
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})
```

**Funzionano senza modifiche di logica** (solo endpoint diverso):
- `CreateMultipartUploadCommand`, `UploadPartCommand`, `CompleteMultipartUploadCommand`,
  `AbortMultipartUploadCommand` (il flusso multipart init/urls/complete/abort);
- `getSignedUrl(...)` per presigned **PUT** (upload) e **GET** (download);
- `HeadObjectCommand` (usato nel flusso di condivisione);
- `PutObjectCommand` / `GetObjectCommand`.

**Punti dove tocchi il codice** (backend Express + eventuali lambda ancora vive):
- ogni `new S3Client({...})` → aggiungere `endpoint` + `region: 'auto'` + credenziali R2;
- variabili d'ambiente: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
  (al posto di quelle S3/`BUCKET_NAME`);
- il nome bucket resta un parametro (`Bucket: process.env.R2_BUCKET`).

**Frontend:** **nessuna modifica** — continua a fare PUT/GET verso gli URL presigned che il backend
gli passa. Cambia solo l'host dell'URL (r2.cloudflarestorage.com o il tuo dominio custom).

**Compatibilità con lo streaming (#6):** piena. R2 supporta il multipart (parti ≥5 MB, max object
5 TB) → il formato "v2" a chunk e lo streaming upload/download descritti in
[crypto/README.md §3](../vue-app/src/crypto/README.md) funzionano identici. Nessun conflitto.

---

## 5. Configurazione R2 (una tantum)

1. Creare il bucket R2.
2. Generare un **API token R2** (S3 credentials) con permessi read/write sul bucket → `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.
3. Impostare la **CORS policy** sul bucket: origin del frontend (dev + prod), metodi `GET, PUT, HEAD`,
   header consentiti (`*` o l'elenco che usi), expose `ETag` (serve al multipart).
4. (Opzionale ma consigliato per i link pubblici) collegare un **dominio custom** al bucket per il
   download via CDN Cloudflare.

---

## 6. Migrazione dei dati esistenti

Copiare gli oggetti già su S3 verso R2. Opzioni:
- **Cloudflare R2 Super Slurper** (strumento gestito di Cloudflare per migrare da S3 → R2);
- **rclone** (`rclone sync s3:bucket r2:bucket`);
- **`aws s3 sync`** verso l'endpoint R2 (S3-compat).

Strategia consigliata (zero downtime):
1. copia bulk iniziale S3 → R2;
2. **dual-read** temporaneo: il backend prova R2, fallback S3 per gli oggetti non ancora copiati;
3. copia incrementale finale;
4. switch completo su R2;
5. dismissione bucket S3 dopo un periodo di sicurezza.

⚠️ **Attenzione ai formati file:** i file "v1" (unico blob GCM) e "v2" (chunked, #6) restano **byte-identici**
su R2 — la migrazione copia byte, non ricifra. Le chiavi e i metadati (DynamoDB) **non si toccano**: gli
`s3Key` restano gli stessi, cambia solo dove sono fisicamente gli oggetti.

---

## 7. Checklist migrazione

- [ ] Verificare **prezzi correnti** R2/S3 e stimare il risparmio sul tuo volume reale (vedi §8).
- [ ] Verificare eventuali requisiti di **data residency**.
- [ ] Creare bucket R2 + API token scoped.
- [ ] Configurare **CORS** R2 (origin frontend dev+prod, `GET/PUT/HEAD`, expose `ETag`).
- [ ] Aggiungere env `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET`.
- [x] Aggiornare le istanze `S3Client` (endpoint + region `auto` + credenziali). ✅ **il codice è già pronto**:
      `config/aws.js` fa lo switch automatico quando le 4 env R2 sono presenti e omette `ACL`/`ServerSideEncryption`
      su R2 (che li rifiuta). Vedi [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) §5-bis. Resta solo l'infra.
- [ ] Test: upload multipart end-to-end (init→urls→PUT→complete) su R2.
- [ ] Test: download via presigned GET (file/condivisione/link pubblico) su R2.
- [ ] Test: `HeadObject` nel flusso condivisione.
- [ ] Copia dati S3 → R2 (Super Slurper / rclone) + verifica integrità.
- [ ] (Opz.) dominio custom + CDN per i download pubblici.
- [ ] Switch e monitoraggio; dismissione S3 dopo periodo di sicurezza.

---

## 8. Stima del risparmio (formula)

```
Costo egress S3 attuale  ≈  GB_scaricati_al_mese × $0.09
Costo R2 al mese         ≈  GB_stoccati × $0.015
                            + (scritture/mese ÷ 1e6) × $4.50
                            + (letture/mese  ÷ 1e6) × $0.36
                            + $0 egress
Risparmio ≈ Costo_egress_S3 − (delta operazioni R2)
```

Regola pratica: se scarichi **molti GB** rispetto al numero di **operazioni**, R2 stravince (paghi lo
storage e le operazioni, ma niente egress). Se hai tantissime **scritture di file piccoli**, tieni
d'occhio le Class A ($4.50/milione).

> Compila la formula con i tuoi numeri reali (GB scaricati/mese) per la decisione: è lì che vedi il
> risparmio concreto.

---

## 9. Parità funzionale da verificare prima

- **Multipart R2**: parti min ~5 MB, max object 5 TB, max 10.000 parti (allineato a S3). ✅ per il tuo flusso.
- **Presigned PUT/GET**: supportati. Verifica la scadenza (`expiresIn`) e che l'`ETag` torni nelle risposte
  PUT (serve al `complete`).
- **Lifecycle rules / versioning / event notifications**: R2 li ha, ma verifica la parità con ciò che usi
  (tu chiami `complete` direttamente, non via evento S3 → nessuna dipendenza da S3 Events).
- **Header/ACL S3 esotici**: R2 non supporta l'intero set di header `x-amz-*`/ACL di S3. Il flusso base
  (put/get/head/multipart/presigned) è ok; evita ACL avanzate.

---

## 10. Rollback

Poiché DynamoDB (con gli `s3Key`) e il codice restano quasi identici, il rollback è semplice:
- mantenere il bucket S3 attivo durante la fase di dual-read;
- in caso di problemi, ripuntare gli `S3Client` all'endpoint S3 (rimuovere `endpoint`/credenziali R2) e
  tornare al bucket S3. Nessuna modifica ai dati DynamoDB necessaria.

---

## 11. Verdetto

- **Storage → R2: consigliato.** Egress zero, S3-compatibile, E2E intatta, migrazione a basso rischio.
- **DB / Auth / Compute: restano su AWS/Fly** (non necessari all'obiettivo; Cognito è il pezzo più
  scomodo da lasciare e non ha equivalente diretto su Cloudflare).

---

*Documento creato il 2026-06-27. Piano per lavoro futuro. Prima di procedere: verificare prezzi correnti,
requisiti di data residency, e stimare il risparmio sul volume reale di download.*
