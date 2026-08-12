# LeTransfer - Secure & Modern File Sharing

**LeTransfer** è una piattaforma di trasferimento file moderna, sicura e performante, progettata per offrire un'esperienza utente premium simile a WeTransfer, ma con funzionalità avanzate di sicurezza e gestione dei dati.

Il progetto si distingue per la sua architettura **Serverless** su AWS e per l'implementazione nativa della cifratura **End-to-End (E2E)**, garantendo che i dati degli utenti rimangano privati e inaccessibili persino al server stesso.

---

## ✨ Funzionalità Principali

### 🚀 Trasferimento File Avanzato
*   **Upload Multipart S3**: Supporto per il caricamento di file di grandi dimensioni (GB/TB) tramite upload parallelo e chunking, massimizzando la velocità e l'affidabilità.
*   **Resumable Uploads**: I caricamenti interrotti possono essere ripresi automaticamente senza ricominciare da zero.
*   **Gestione Concorrenza**: Sistema intelligente di code per gestire upload multipli simultanei senza saturare la banda.

### 🔒 Sicurezza e Privacy (E2E)
*   **Cifratura Client-side**: Tutti i file vengono cifrati nel browser (AES-256-GCM) prima dell'upload.
*   **Zero-Knowledge**: Il server non possiede mai le chiavi di decifrazione dei file.
*   **Link Sicuri**: I link pubblici contengono la chiave di cifratura nel fragment URL (`#key=...`), che non viene mai inviato al server.
*   **Condivisione Email Sicura**: Scambio chiavi basato su RSA-OAEP per inviare file cifrati a utenti specifici.

### 🛠 Gestione e Condivisione
*   **Account Utente**: Login/Registrazione (AWS Cognito) per gestire la cronologia dei file.
*   **Link Condivisibili Personalizzabili**: Imposta data di scadenza, password di accesso e numero massimo di download.
*   **File Manager**: Dashboard per visualizzare, cercare e gestire tutti i file caricati e ricevuti.
*   **Anteprima Real-time**: Preview integrata per immagini, PDF, video e audio.

### 🎨 Esperienza Utente Premium
*   **Design Geometrico**: Interfaccia utente curata ("Premium Geometric") con animazioni fluide GSAP.
*   **Responsive**: Ottimizzato per desktop, tablet e mobile.
*   **Feedback Immediato**: Notifiche toast, progress bar dettagliate e stati di caricamento/decifratura chiari.

---

## 🏗 Tech Stack

### Frontend (`vue-app/`)
*   **Framework**: Vue 3 (`<script setup>`) + TypeScript + Vite
*   **Styling**: TailwindCSS + PrimeVue (Componenti UI)
*   **State Management**: Pinia (store) + composable personalizzati
*   **Routing**: Vue Router (navigation guard per le route protette)
*   **Animazioni**: GSAP (GreenSock)
*   **Networking**: Axios (con interceptor per Auth)
*   **Crypto**: Web Crypto API (Nativo browser)

### Backend
*   **Auth**: Amazon Cognito
*   **Storage**: Amazon S3 (Bucket privati con presigned URLs)
*   **Database**: Amazon DynamoDB (Metadati file e chiavi pubbliche)
*   **Compute**: backend Node.js + Express unico (deploy su Fly.io)
*   **Nota**: le vecchie AWS Lambda + API Gateway sono state dismesse e i loro stack rimossi — tutta la logica vive nell'Express. Il contratto completo è in [docs/BACKEND_API_DOCS.md](docs/BACKEND_API_DOCS.md)

---

## 📚 Documentazione

L'indice completo è in [**docs/README.md**](docs/README.md). I documenti da cui partire:

*   [**Contratto API backend**](docs/BACKEND_API_DOCS.md): architettura, auth, modelli DynamoDB, tutti gli endpoint. È la fonte di verità quando un altro documento lo contraddice.
*   [**Modello crittografico**](vue-app/src/crypto/README.md): primitive, formato dei file, ciclo di vita delle chiavi — mantenuto nello stesso commit del codice che descrive.
*   [**Lavoro backend aperto**](docs/BACKEND_HANDOFF.md): cosa manca per aprire al pubblico, in ordine di priorità.

Riferimento per funzionalità: [autenticazione](docs/01-autenticazione.md), [upload](docs/02-upload-file.md), [transfer manager](docs/03-transfer-manager.md), [condivisione](docs/04-condivisione-file.md), [shared links](docs/05-shared-links.md), [gestione file](docs/06-gestione-file-dynamodb.md), [profilo](docs/07-profilo-utente.md), [landing page](docs/08-landing-page.md).

---

## 🚀 Setup Sviluppo

1.  **Clona il repo**:
    ```bash
    git clone ...
    cd letransfer
    ```

2.  **Installa dipendenze**:
    ```bash
    npm install
    # oppure
    pnpm install
    ```

3.  **Variabili d'ambiente**:
    Copia `.env.example` in `.env` e configura i parametri (inclusi endpoint API Lambda e User Pool Cognito).

4.  **Avvia server di sviluppo**:
    ```bash
    npm run dev
    ```

---
*Progetto sviluppato con ❤️ utilizzando Modern Web Technologies.*
