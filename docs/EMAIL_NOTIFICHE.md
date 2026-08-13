# 📧 Notifiche email — riprogettazione post-React

> Documento dedicato. La notifica email "file condiviso" esisteva come **template React Email**
> nella vecchia app React (`src/emails/TicketCreated.tsx`), ora rimossa con la migrazione a Vue.
> Qui trovi: cosa faceva, perché va riprogettata, e come reimplementarla **lato backend**.

---

## 1. Stato attuale (cosa c'era e cosa manca)

- Esisteva un template **React Email** `TicketCreated` (notifica "ti è stato condiviso un file").
- Dipendenze: `react-email` (CLI/preview) + `@react-email/components` + `@react-email/render`.
- Script di preview nel `package.json` di root: `"email": "email dev --dir src/emails"`.
- **Non veniva mai inviato**: il backend ha `resend` tra le dipendenze ma **non lo usa**;
  `POST /api/file-sharing/send` registra i record di condivisione ma **non manda email**
  (vedi `BACKEND_API_DOCS.md` §4.7).

Con la dismissione della React, il template e le sue dipendenze (legate a React) sono stati
**rimossi**. La feature "invia email quando condividi un file" resta quindi **da implementare**,
questa volta interamente lato backend.

---

## 2. Perché va riprogettata (non semplicemente spostata)

`@react-email/components` rende il template come **JSX/React**: tenerlo significherebbe
reintrodurre React (+ `react-dom`) come dipendenza, stavolta nel **backend**. Avendo abbandonato
React, conviene disaccoppiare il template dal framework UI.

---

## 3. Opzioni di reimplementazione

| Opzione | Come | Pro | Contro |
|---|---|---|---|
| **A — HTML template puro** (consigliata) | Funzione che ritorna una stringa HTML (template literal o MJML/Handlebars) + `resend.emails.send()` | Zero React, leggera, nessun conflitto framework | Riscrivi il markup a mano (una volta) |
| **B — `@react-email/render` headless** | Mantieni il JSX e lo renderizzi server-side con `render()` | Riusi il template esistente quasi as-is | Reintroduce React come dep di build nel backend |
| **C — MJML** | Template `.mjml` → HTML compilato | Email responsive robuste cross-client | Aggiunge il toolchain MJML |

**Raccomandazione**: **Opzione A**. Il template è semplice (un titolo, due paragrafi, un box file con
1–2 bottoni, un footer, un tracking pixel opzionale): convertirlo in HTML inline puro è rapido e
toglie ogni dipendenza da React.

---

## 4. Dove va agganciata nel backend

Il backend è ormai consolidato sull'Express ([BACKEND_API_DOCS.md](BACKEND_API_DOCS.md)): l'invio email va richiamato in:
- **`POST /api/share`** (condivisione utente→utente) — dopo aver creato il record in `SharesTable`.
- **`POST /api/file-sharing/send`** (condivisione via email) — è il punto naturale, oggi registra
  solo i record.

Dati già disponibili in quei punti: `senderName`/`senderEmail`, `recipientEmail`, `fileName`,
e l'URL firmato del file (`downloadUrl`). Mancano eventualmente: lo `username` del destinatario
(risolvibile via Cognito), e l'eventuale `viewUrl`/`trackingPixelUrl`.

---

## 5. Snippet di partenza (Opzione A — HTML puro + Resend)

```js
// services/email.js
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)

function renderFileSharedHtml({ senderName, username, fileName, downloadUrl = '', viewUrl = '', trackingPixelUrl = '' }) {
  const buttons = [
    downloadUrl && `<a href="${downloadUrl}" style="background:#724CF9;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;display:inline-block">📥 Download File</a>`,
    viewUrl && viewUrl !== downloadUrl && `<a href="${viewUrl}" style="background:#10b981;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;display:inline-block">👁️ View File</a>`,
  ].filter(Boolean).join('<br/>')

  return `
  <div style="font-family:sans-serif;max-width:465px;margin:40px auto;border:1px solid #eaeaea;border-radius:6px;padding:20px">
    <h1 style="font-size:24px;font-weight:400;text-align:center;margin:30px 0">User ${senderName} has sent you a new file</h1>
    <p style="color:#000;font-size:14px;line-height:24px">Hello <strong>${username}</strong>,</p>
    <p style="color:#000;font-size:14px;line-height:24px">the user <strong>${senderName}</strong> has sent you a new file.</p>
    <div style="border:1px solid #eaeaea;border-radius:6px;padding:16px">
      <p style="font-size:14px;font-weight:500;margin:0 0 8px">${fileName}</p>
      ${buttons || '<p style="color:#ef4444;font-size:14px">⚠️ File links not available</p>'}
    </div>
    <hr style="border:1px solid #eaeaea;margin:26px 0"/>
    <p style="color:#666;font-size:12px;line-height:24px">This message was intended for <span style="color:#000">${username}</span>. If you aren't the receiver of this file, please ignore this email.</p>
    ${trackingPixelUrl ? `<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none"/>` : ''}
  </div>`
}

export async function sendFileSharedEmail({ to, senderName, username, fileName, downloadUrl, viewUrl, trackingPixelUrl }) {
  return resend.emails.send({
    from: process.env.EMAIL_FROM,            // es. "Novren <noreply@novren.net>"
    to,
    subject: `${senderName} ti ha condiviso un file`,
    html: renderFileSharedHtml({ senderName, username, fileName, downloadUrl, viewUrl, trackingPixelUrl }),
  })
}
```

Env nuove richieste: `RESEND_API_KEY`, `EMAIL_FROM` (dominio verificato su Resend).

---

## 6. Template originale (riferimento)

Per fedeltà di design, ecco il markup originale del template React Email rimosso. **Props**:
`senderName`, `username`, `fileName`, `downloadUrl?`, `viewUrl?`, `trackingPixelUrl?`.

Comportamenti da preservare:
- Titolo: *"User {senderName} has sent you a new file"*.
- Saluto a `username`, riga col mittente.
- Box file con `fileName` e fino a **2 bottoni**: Download (viola `#724CF9`) e View (verde `#10b981`),
  mostrato solo se `viewUrl` ≠ `downloadUrl`. Se mancano entrambi → *"⚠️ File links not available"*.
- Footer "This message was intended for {username}…".
- **Tracking pixel** 1×1 opzionale (`trackingPixelUrl`) per il tracking apertura — nota: spesso
  bloccato dai client email.

```tsx
// src/emails/TicketCreated.tsx — RIMOSSO (React Email). Conservato qui solo come riferimento di design.
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Text, Tailwind } from "@react-email/components";

export const TicketCreated = ({ senderName, username, fileName, downloadUrl = "", viewUrl = "", trackingPixelUrl = "" }) => (
  <Html>
    <Head />
    <Preview>Support Ticket Confirmation Email 🎉</Preview>
    <Tailwind>
      <Body className='bg-white font-sans'>
        <Container className='border border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] max-w-[465px]'>
          <Heading className='text-black text-[24px] text-center my-[30px]'>
            User {senderName} has sent you a new file
          </Heading>
          <Text>Hello <strong>{username}</strong>,</Text>
          <Text>the user <strong>{senderName}</strong> has sent you a new file.</Text>
          <div className="border border-[#eaeaea] rounded-md p-4">
            <p className="font-medium">{fileName}</p>
            {downloadUrl && <Link href={downloadUrl} className="bg-[#724CF9] text-white px-4 py-2 rounded-md">📥 Download File</Link>}
            {viewUrl && viewUrl !== downloadUrl && <Link href={viewUrl} className="bg-[#10b981] text-white px-4 py-2 rounded-md">👁️ View File</Link>}
            {!downloadUrl && !viewUrl && <p className="text-red-500">⚠️ File links not available</p>}
          </div>
          <Hr className='border-[#eaeaea] my-[26px]' />
          <Text className='text-[#666] text-[12px]'>
            This message was intended for <span className='text-black'>{username}</span>. If you aren't the receiver of this file, please ignore this email.
          </Text>
          {trackingPixelUrl ? <img src={trackingPixelUrl} width="1" height="1" alt="" style={{ display: 'none' }} /> : null}
        </Container>
      </Body>
    </Tailwind>
  </Html>
);
```

---

## 7. Checklist implementazione

- [ ] Scegliere l'opzione (consigliata: A — HTML puro).
- [ ] `services/email.js` con `renderFileSharedHtml` + `sendFileSharedEmail` (§5).
- [ ] Env: `RESEND_API_KEY`, `EMAIL_FROM` (dominio verificato su Resend).
- [ ] Agganciare l'invio in `POST /api/file-sharing/send` e/o `POST /api/share` (§4).
- [ ] Risolvere `username` del destinatario (Cognito) e generare `downloadUrl` firmato.
- [ ] Gestire i fallimenti email **senza** bloccare la condivisione (invio best-effort, log su errore).
