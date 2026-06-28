# 🔗 Shared Links

## Overview

Sistema per creare link pubblici condivisibili con:
- **Scadenza temporale** configurabile
- **Password protection** opzionale
- **Limite download** configurabile
- **Revoca** in qualsiasi momento

---

## Architettura

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Vue)                          │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐ │
│  │              SharedLinksTable.vue                       │ │
│  │  - Lista link generati                                  │ │
│  │  - Copia URL                                            │ │
│  │  - Settings (password, scadenza)                        │ │
│  │  - Revoca/Rigenera                                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │           useSharedLinks (composable)                   │ │
│  │  - fetchLinks() / createLink()                          │ │
│  │  - revokeLink(id) / regenerateLink(id)                  │ │
│  │  - updateLink(id, updates) / deleteLink(id)             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND (Express unico — VITE_API_URL)          │
│  GET    /api/shared-links               → Lista link utente  │
│  POST   /api/shared-links               → Crea link          │
│  POST   /api/shared-links/:id/revoke    → Revoca link        │
│  POST   /api/shared-links/:id/regenerate→ Nuovo URL          │
│  PATCH  /api/shared-links/:id           → Modifica settings   │
│  DELETE /api/shared-links/:id           → Elimina link        │
└─────────────────────────────────────────────────────────────┘
```

---

## Composable: `useSharedLinks`

File: `vue-app/src/composables/useSharedLinks.ts`.

### Valori ritornati

```ts
const {
  links,          // Ref<SharedLink[]>
  isLoading,      // Ref<boolean>
  isCreating,     // Ref<boolean>
  error,          // Ref<string | null>
  fetchLinks,     // () => Promise<void>
  createLink,     // (s3Key, fileName, fileSize, fileType, options?) => Promise<SharedLinkWithEncryption | null>
  revokeLink,     // (id) => Promise<boolean>
  regenerateLink, // (id) => Promise<boolean>
  updateLink,     // (id, updates: Partial<SharedLink>) => Promise<boolean>
  deleteLink,     // (id) => Promise<boolean>
} = useSharedLinks()
```

### Utilizzo

```ts
import { onMounted } from 'vue'

const { links, fetchLinks, revokeLink, updateLink } = useSharedLinks()

onMounted(() => {
  fetchLinks()
})

// Revoca link
await revokeLink('link_123')

// Modifica impostazioni
await updateLink('link_123', {
  expiresAt: '2026-02-01T00:00:00Z',
  maxDownloads: 10,
})
```

> Per i link **cifrati** (E2E), `createLink` può aggiungere il fragment `#key=...` all'URL
> (`encryptedUrl`) tramite `createKeyHash`. La chiave non lascia mai il client.

---

## Tipo SharedLink

```ts
interface SharedLink {
  id: string
  publicToken: string
  fileName: string
  s3Key: string
  url: string
  isPasswordProtected: boolean
  expiresAt: string
  maxDownloads?: number
  downloadCount: number
  revokedAt: string | null
  createdAt: string
}
```

---

## Componente: SharedLinksTable.vue

Tabella interattiva (PrimeVue `DataTable`) per gestire i link.

### Colonne
| Colonna | Descrizione |
|---------|-------------|
| File | Nome del file |
| URL | Link con pulsante copia |
| Sicurezza | Icona lucchetto se protetto |
| Download | Contatore download/limite |
| Scadenza | Data con stato (attivo/scaduto) |
| Azioni | Settings, Revoca |

### Modal Settings

Stato locale con `ref`, feedback via `notify` (toast PrimeVue), niente `message.success`/`setState`:

```ts
const settingsVisible = ref(false)
const editingLink = ref<SharedLink | null>(null)
const newExpiryDate = ref<Date | null>(null)
const newMaxDownloads = ref<number | undefined>()

const handleSaveSettings = async () => {
  if (!editingLink.value) return
  const ok = await updateLink(editingLink.value.id, {
    expiresAt: newExpiryDate.value?.toISOString(),
    maxDownloads: newMaxDownloads.value,
  })
  if (ok) {
    notify.success('Impostazioni salvate')
    settingsVisible.value = false
  }
}
```

### Indicatore Stato

Funzione che ritorna severity + label per un `<Tag>` PrimeVue:

```ts
import dayjs from 'dayjs'

const linkStatus = (link: SharedLink) => {
  if (link.revokedAt) return { severity: 'danger', label: 'Revocato' }
  if (dayjs(link.expiresAt).isBefore(dayjs())) return { severity: 'warn', label: 'Scaduto' }
  return { severity: 'success', label: 'Attivo' }
}
```

```vue
<Tag :severity="linkStatus(link).severity" :value="linkStatus(link).label" />
```

---

## API Endpoints

Riferimento completo in `docs/BACKEND_API_DOCS.md` §4.5. Sintesi:

- **`GET /api/shared-links`** → lista link dell'owner (`{ data: SharedLink[] }`).
- **`POST /api/shared-links`** → crea link (body: `s3Key`, `fileName`, `expiresInHours`, `password?`, `maxDownloads?`).
- **`POST /api/shared-links/:id/revoke`** → revoca.
- **`POST /api/shared-links/:id/regenerate`** → nuovo `publicToken` e reset.
- **`PATCH /api/shared-links/:id`** → aggiorna `expiresAt` / `password` / `maxDownloads`.
- **`DELETE /api/shared-links/:id`** → elimina.

---

## Considerazioni

1. **URL Unici** — ogni link ha un `publicToken` (nanoid) non indovinabile.
2. **Password Hashing** — le password sono hashate lato server (Argon2).
3. **Rate Limiting** — limiti per prevenire abuse.
4. **Accesso pubblico** — flusso a 3 step (info → access con password → file con session token).
