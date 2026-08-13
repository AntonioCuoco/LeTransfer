# Documentazione LeTransfer

> **Cos'è questa cartella.** La documentazione di lavoro del progetto: cosa è aperto, cosa è
> deciso, e dove sta la verità quando due documenti si contraddicono.
>
> **Regola d'oro.** Quando un documento e il codice non concordano, il documento da credere è
> [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) per il backend e
> [vue-app/src/crypto/README.md](../vue-app/src/crypto/README.md) per la crittografia: sono gli
> unici due che dichiarano di seguire il codice e vengono aggiornati insieme a lui.

---

## Da dove si comincia

| Documento | A cosa serve |
|---|---|
| ⭐ [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md) | **L'indice unico del lavoro backend aperto**, in ordine di priorità. Ogni voce dice cosa fare, perché, e come si verifica |
| ⭐ [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) | Il contratto completo: architettura, auth, modelli DynamoDB, tutti gli endpoint, config e limiti |
| [DA_CONTROLLARE_QUANDO.md](DA_CONTROLLARE_QUANDO.md) | Checklist **condizionali** — cosa verificare quando prendi il dominio, quando apri al pubblico, quando accendi i pagamenti |

---

## Sicurezza e promessa del prodotto

| Documento | Contenuto |
|---|---|
| [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md) | L'analisi di sicurezza completa e il piano d'esecuzione. Restano aperti i punti #2, #3, #4, #5, #8, #9 |
| [PAGINE_CRITICHE.md](PAGINE_CRITICHE.md) | Le regole non negoziabili sulle pagine dove nascono e si usano le chiavi |
| [BACKEND_SECURITY_TODO.md](BACKEND_SECURITY_TODO.md) | Hardening backend #1–#15. Resta aperta la CSP/HTTPS, che è la voce 8 dell'handoff |
| [SECURITY_PUNTI_RINVIATI.md](SECURITY_PUNTI_RINVIATI.md) | I punti #5 e #14 più la **checklist di prove da eseguire** (non è codice da scrivere) |
| [ANTI_ABUSO.md](ANTI_ABUSO.md) | Modello di abuso del canale pubblico e contromisure |

---

## Work order aperti

Specifiche pronte da implementare, ognuna con il suo "come".

| Documento | Stato |
|---|---|
| [BACKEND_WORKORDER_AUTH_COOKIES.md](BACKEND_WORKORDER_AUTH_COOKIES.md) | **Aperto.** Refresh token in cookie `httpOnly`; oggi i token stanno in cookie leggibili da JavaScript |
| [EMAIL_NOTIFICHE.md](EMAIL_NOTIFICHE.md) | **Aperto.** Design dell'invio email (Resend). È la voce 14 dell'handoff |
| [BACKEND_HANDOFF.md §13-bis](BACKEND_HANDOFF.md) | **Aperto.** I tre endpoint di piani e fatturazione che il frontend già chiama e che non esistono ancora. `GET /api/user/plan` è staccabile dagli altri due e non dipende da Stripe |
| [MIGRATION_S3_TO_R2.md](MIGRATION_S3_TO_R2.md) | **Cutover fatto.** Resta come riferimento sui costi e come piano di verifica |

---

## Roadmap

| Documento | Taglio |
|---|---|
| [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) | Prodotto: cosa costruiamo e in che ordine |
| [BACKEND_WORKORDER_ROADMAP.md](BACKEND_WORKORDER_ROADMAP.md) | Backend, inclusi i criteri di accettazione del canale guest (§C.10) |
| [FRONTEND_WORKORDER_ROADMAP.md](FRONTEND_WORKORDER_ROADMAP.md) | Frontend Vue |

---

## Riferimento per funzionalità

Descrizioni per area dell'applicazione. Utili per orientarsi, ma **più vecchie del codice**: per il
contratto con il backend vale sempre [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md).

1. [Autenticazione](01-autenticazione.md) — login, registrazione, OAuth, refresh token
2. [Upload file](02-upload-file.md) — upload standard e multipart
3. [Transfer manager](03-transfer-manager.md) — code, concorrenza, progresso
4. [Condivisione file](04-condivisione-file.md) — invio a utente registrato
5. [Shared links](05-shared-links.md) — link pubblici, scadenza, password, revoca
6. [Gestione file (DynamoDB)](06-gestione-file-dynamodb.md) — schema dati e sincronizzazione
7. [Profilo utente](07-profilo-utente.md)
8. [Landing page](08-landing-page.md)
10. [E2E encryption](10-e2e-encryption.md) — ⚠️ descrive ancora il vecchio formato a blob unico. Per
    il formato reale (v2 a chunk) vedi [crypto/README.md §3](../vue-app/src/crypto/README.md)

---

## Per gli utenti finali

[GUIDA_UTENTE_E2E.md](GUIDA_UTENTE_E2E.md) — spiegazione della cifratura in linguaggio non tecnico.
Le stesse cose sono in-app su `/come-funziona` e `/sicurezza`.

---

## Fuori da questa cartella

**[vue-app/src/crypto/README.md](../vue-app/src/crypto/README.md)** — la specifica del nucleo
crittografico, mantenuta nello stesso commit del codice che descrive. È il documento da leggere per
verificare le affermazioni del prodotto: primitive, formato v2 a chunk, ciclo di vita delle chiavi,
verifica del destinatario, e la §7 che dice **dove la promessa si ferma**.
