# Guida Rapida - Cifratura End-to-End

## Cos'è la Cifratura End-to-End?

LeTransfer protegge i tuoi file con cifratura End-to-End (E2E). Questo significa che:

- ✅ I tuoi file sono cifrati **sul tuo dispositivo** prima di essere caricati
- ✅ Solo tu puoi decifrare i tuoi file
- ✅ Il server **non può** leggere i tuoi file
- ✅ Nessuno può accedere ai tuoi file senza la tua **Recovery Key**

## Primo Utilizzo

### 1. Configurazione Recovery Key

Quando usi LeTransfer per la prima volta, vedrai un avviso:

```
⚠️ Sicurezza End-to-End non configurata
```

**Clicca "Configura Ora"** per iniziare.

### 2. Genera la Recovery Key

1. Clicca **"Genera Recovery Key"**
2. Vedrai **24 parole** generate casualmente
3. **IMPORTANTE**: Queste 24 parole sono l'UNICO modo per recuperare i tuoi file!

### 3. Salva le 24 Parole

**Dove salvare la Recovery Key:**
- ✅ Password manager (1Password, Bitwarden, LastPass)
- ✅ Carta e penna in un luogo sicuro
- ✅ Cassaforte fisica

**Dove NON salvare:**
- ❌ Screenshot sul telefono
- ❌ Note non cifrate
- ❌ Email
- ❌ Cloud storage non cifrato

### 4. Verifica

1. Inserisci le 24 parole per confermare
2. Clicca **"Verifica e Attiva"**
3. ✅ Fatto! Ora puoi caricare file cifrati

## Utilizzo Quotidiano

### Caricare un File

1. Clicca **"Carica File"** o trascina un file
2. Il file viene **automaticamente cifrato** prima dell'upload
3. Solo tu puoi decifrarlo con la tua Recovery Key

### Scaricare un File

1. Clicca sul file che vuoi scaricare
2. Il file viene **automaticamente decifrato** prima del download
3. Ricevi il file originale, non cifrato

### Condividere un File

Quando condividi un file:
- Il destinatario riceve un **link sicuro**
- Se il destinatario è registrato, può decifrare il file
- Se il destinatario non è registrato, riceve il file cifrato (con chiave nel link)

## Nuovo Dispositivo

### Accedere ai File da un Nuovo Dispositivo

1. Fai login su LeTransfer
2. Vedrai: **"Richiesta Chiave di Sicurezza"**
3. Inserisci le tue **24 parole**
4. Clicca **"Sblocca File"**
5. ✅ Ora puoi accedere ai tuoi file cifrati

## Domande Frequenti

### Ho perso la Recovery Key, cosa faccio?

❌ **Purtroppo i file cifrati sono irrecuperabili.**

La cifratura E2E significa che nemmeno LeTransfer può recuperare i tuoi file senza la Recovery Key. Questo è per la tua sicurezza!

**Cosa puoi fare:**
- Caricare nuovi file (verrà generata una nuova Recovery Key)
- I vecchi file rimarranno inaccessibili

### Posso cambiare la Recovery Key?

Attualmente non è possibile cambiare la Recovery Key. Se vuoi usare una nuova Recovery Key:

1. Scarica tutti i file importanti
2. Elimina il tuo account
3. Crea un nuovo account
4. Genera una nuova Recovery Key
5. Ricarica i file

### La Recovery Key è sicura?

Sì! La Recovery Key:
- ✅ Ha 256 bit di entropia (estremamente sicura)
- ✅ Non viene mai inviata al server
- ✅ È usata solo localmente sul tuo dispositivo
- ✅ Segue lo standard BIP39 (usato anche per Bitcoin)

### Qualcuno può rubare i miei file dal server?

No! Anche se qualcuno accede al server:
- ❌ I file sono cifrati con AES-256-GCM
- ❌ Le chiavi sono cifrate con la tua Master Key
- ❌ La Master Key è derivata dalla tua Recovery Key
- ❌ La Recovery Key non è sul server

**Senza la tua Recovery Key, i file sono inutilizzabili.**

### Posso condividere la Recovery Key con qualcuno?

**NO! Mai condividere la Recovery Key!**

Se qualcuno ha la tua Recovery Key:
- ❌ Può accedere a TUTTI i tuoi file
- ❌ Può decifrare TUTTI i tuoi file
- ❌ Può caricare file a tuo nome

La Recovery Key è come la password del tuo conto bancario: **non condividerla mai!**

### Come funziona tecnicamente?

1. **Upload**:
   ```
   File → Cifrato con AES-256 → Upload su S3
   Chiave File → Cifrata con Master Key → Salvata in DB
   ```

2. **Download**:
   ```
   Chiave File cifrata → Decifrata con Master Key → Chiave File
   File cifrato → Decifrato con Chiave File → File originale
   ```

3. **Master Key**:
   ```
   Recovery Key + Salt → PBKDF2 → Master Key (solo in memoria)
   ```

### Cosa succede se dimentico di inserire la Recovery Key?

Se chiudi il browser senza inserire la Recovery Key:
- ⚠️ I file rimarranno cifrati
- ⚠️ Non potrai scaricarli
- ⚠️ Al prossimo accesso, ti verrà richiesta di nuovo

**Soluzione**: Inserisci la Recovery Key quando richiesto.

### Posso usare LeTransfer senza cifratura E2E?

No, la cifratura E2E è obbligatoria per tutti i file. Questo garantisce:
- 🔒 Massima sicurezza
- 🔒 Privacy totale
- 🔒 Protezione dei dati

## Supporto

Se hai problemi:
1. Verifica di aver salvato correttamente la Recovery Key
2. Controlla di inserire tutte le 24 parole nell'ordine corretto
3. Assicurati di non avere spazi extra o errori di battitura

**Ricorda**: La Recovery Key è l'unico modo per accedere ai tuoi file cifrati. Salvala in un luogo sicuro!

---

## Checklist Sicurezza

Prima di iniziare a usare LeTransfer, assicurati di:

- [ ] Aver generato la Recovery Key
- [ ] Aver salvato le 24 parole in un luogo sicuro
- [ ] Aver verificato di poter accedere alla Recovery Key salvata
- [ ] Aver testato il recupero su un nuovo dispositivo (opzionale ma consigliato)
- [ ] Non aver condiviso la Recovery Key con nessuno
- [ ] Non aver salvato la Recovery Key in luoghi non sicuri

✅ Se hai completato tutti i punti, sei pronto per usare LeTransfer in sicurezza!
