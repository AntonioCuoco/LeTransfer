# Documentazione LeTransfer

Questa cartella contiene la documentazione completa per il sistema di cifratura End-to-End di LeTransfer.

## Documenti Disponibili

### 📘 [10-e2e-encryption.md](./10-e2e-encryption.md)
**Documentazione Tecnica Completa E2E**

Destinato a: Sviluppatori, DevOps, Security Engineers

Contenuto:
- Architettura del sistema E2E
- Flusso di cifratura dettagliato
- Schema tabelle DynamoDB
- API endpoints
- Algoritmi crittografici
- Problemi risolti e soluzioni
- Guida al testing
- Troubleshooting tecnico

---

### 📝 [CHANGELOG_E2E_FIX.md](./CHANGELOG_E2E_FIX.md)
**Changelog dei Fix Applicati**

Destinato a: Sviluppatori, Team Lead, QA

Contenuto:
- Dettaglio di tutti i fix applicati
- Comparazioni before/after
- File modificati
- Impatto delle modifiche
- Test raccomandati
- Metriche di successo

---

### 👤 [GUIDA_UTENTE_E2E.md](./GUIDA_UTENTE_E2E.md)
**Guida Utente Semplificata**

Destinato a: Utenti finali, Support Team

Contenuto:
- Spiegazione semplice della cifratura E2E
- Guida passo-passo per il setup
- Istruzioni per l'uso quotidiano
- FAQ comuni
- Checklist di sicurezza

---

## Quick Links

### Per Sviluppatori
- [Architettura E2E](./10-e2e-encryption.md#architettura-del-sistema)
- [Problemi Risolti](./10-e2e-encryption.md#problemi-risolti)
- [API Endpoints](./10-e2e-encryption.md#api-endpoints)
- [Testing](./10-e2e-encryption.md#testing)

### Per QA/Testing
- [Test Raccomandati](./CHANGELOG_E2E_FIX.md#testing-raccomandato)
- [Metriche di Successo](./CHANGELOG_E2E_FIX.md#metriche-di-successo)

### Per Support
- [Guida Utente](./GUIDA_UTENTE_E2E.md)
- [FAQ](./GUIDA_UTENTE_E2E.md#domande-frequenti)
- [Troubleshooting](./10-e2e-encryption.md#troubleshooting)

---

## Panoramica Rapida

### Cos'è la Cifratura E2E?

LeTransfer implementa un sistema di cifratura End-to-End che garantisce:
- 🔒 I file sono cifrati sul client prima dell'upload
- 🔒 Il server non può decifrare i file
- 🔒 Solo l'utente con la Recovery Key può accedere ai file

### Componenti Principali

1. **Recovery Key**: 24 parole (BIP39) generate localmente
2. **Master Key**: Derivata dalla Recovery Key, mantenuta solo in memoria
3. **File Keys**: Chiavi AES-256 uniche per ogni file, cifrate con la Master Key

### Flusso Semplificato

```
Setup → Genera Recovery Key → Deriva Master Key
  ↓
Upload → Genera File Key → Cifra File → Wrap File Key → Salva
  ↓
Download → Unwrap File Key → Decifra File → Restituisci
```

---

## Sicurezza

### Cosa il Server NON Può Fare
- ❌ Leggere il contenuto dei file
- ❌ Decifrare le chiavi dei file
- ❌ Recuperare la Recovery Key
- ❌ Derivare la Master Key

### Cosa l'Utente DEVE Fare
- ✅ Salvare la Recovery Key in un luogo sicuro
- ✅ Non condividere mai la Recovery Key
- ✅ Inserire la Recovery Key su nuovi dispositivi

---

## Algoritmi Utilizzati

| Componente | Algoritmo | Parametri |
|------------|-----------|-----------|
| File Encryption | AES-256-GCM | IV: 12 bytes |
| Key Wrapping | AES-256-GCM | IV: 12 bytes |
| Key Derivation | PBKDF2 | 100,000 iterazioni, SHA-256 |
| Recovery Key | BIP39 | 24 parole, 256 bit entropia |

---

## Tabelle DynamoDB

### UserRecoveryKeys
Memorizza salt e verification hash per ogni utente.

### UserFileKeys
Memorizza le chiavi cifrate per ogni file.

Vedi [10-e2e-encryption.md](./10-e2e-encryption.md#tabelle-dynamodb) per dettagli completi.

---

## Testing

### Test Essenziali

1. ✅ Setup Recovery Key
2. ✅ Upload file cifrato
3. ✅ Download file cifrato
4. ✅ Recovery su nuovo dispositivo

Vedi [CHANGELOG_E2E_FIX.md](./CHANGELOG_E2E_FIX.md#testing-raccomandato) per dettagli.

---

## Troubleshooting Rapido

### File Corrotto al Download
→ Verifica che la chiave sia stata salvata in DynamoDB

### "Missing encryption data or context"
→ Verifica che EncryptionProvider wrappa il componente

### Recovery Key Non Accettata
→ Verifica di aver inserito tutte le 24 parole correttamente

Vedi [10-e2e-encryption.md](./10-e2e-encryption.md#troubleshooting) per dettagli completi.

---

## Contribuire

Per contribuire alla documentazione:

1. Mantieni la documentazione aggiornata con i cambiamenti al codice
2. Usa linguaggio chiaro e semplice
3. Includi esempi pratici
4. Aggiungi diagrammi quando utile

---

## Contatti

Per domande o suggerimenti sulla documentazione, contatta il team di sviluppo.

---

**Ultima modifica**: 2026-01-20
**Versione**: 2.0.0
