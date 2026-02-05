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

### Frontend
*   **Framework**: React 18 + TypeScript + Vite
*   **Styling**: TailwindCSS + Ant Design (Componenti UI)
*   **State Management**: React Context + Hooks personalizzati
*   **Animazioni**: GSAP (GreenSock)
*   **Networking**: Axios (con intercettori per Auth)
*   **Crypto**: Web Crypto API (Nativo browser)

### Backend (AWS Serverless)
*   **Auth**: Amazon Cognito
*   **Storage**: Amazon S3 (Bucket privati con presigned URLs)
*   **Database**: Amazon DynamoDB (Metadati file e chiavi pubbliche)
*   **Compute**: AWS Lambda (Node.js)
*   **API Gateway**: Gestione endpoint REST

---

## 📚 Documentazione

La documentazione dettagliata è disponibile nella cartella `docs/`:

1.  [**Autenticazione**](docs/01-autenticazione.md): Flussi di login, registrazione e gestione token.
2.  [**Upload File**](docs/02-upload-file.md): Architettura Multipart, Presigned URL e gestione stato.
3.  [**Transfer Manager**](docs/03-transfer-manager.md): Sistema di code e concorrenza.
4.  [**Condivisione File**](docs/04-condivisione-file.md): Logica di invio email e gestione destinatari.
5.  [**Shared Links**](docs/05-shared-links.md): Generazione, validazione e opzioni dei link pubblici.
6.  [**Gestione File (DynamoDB)**](docs/06-gestione-file-dynamodb.md): Schema dati e sincronizzazione S3-DynamoDB.
7.  [**Profilo Utente**](docs/07-profilo-utente.md): Gestione dati utente e impostazioni.
8.  [**Landing Page**](docs/08-landing-page.md): Design e animazioni della pagina pubblica.
9.  [**Infrastruttura AWS**](docs/09-infrastruttura-aws.md): Dettagli sulle risorse CloudFormation e Lambda.
10. [**E2E Encryption**](docs/10-e2e-encryption.md): **(Nuovo)** Dettagli tecnici sull'implementazione crittografica.

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
