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
│                        CLIENT                                │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐ │
│  │              SharedLinksTable                           │ │
│  │  - Lista link generati                                  │ │
│  │  - Copia URL                                            │ │
│  │  - Settings (password, scadenza)                        │ │
│  │  - Revoca/Rigenera                                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │              useSharedLinks hook                        │ │
│  │  - fetchLinks()                                         │ │
│  │  - revokeLink(id)                                       │ │
│  │  - regenerateLink(id)                                   │ │
│  │  - updateLink(id, updates)                              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      AWS BACKEND                             │
│  GET    /shared-links           → Lista link utente         │
│  POST   /shared-links/:id/revoke    → Revoca link          │
│  POST   /shared-links/:id/regenerate → Nuovo URL           │
│  PATCH  /shared-links/:id       → Modifica impostazioni    │
└─────────────────────────────────────────────────────────────┘
```

---

## Hook: `useSharedLinks`

### Interfaccia

```typescript
interface UseSharedLinksReturn {
    links: SharedLink[];
    isLoading: boolean;
    error: string | null;
    
    fetchLinks: () => Promise<void>;
    revokeLink: (linkId: string) => Promise<boolean>;
    regenerateLink: (linkId: string) => Promise<boolean>;
    updateLink: (linkId: string, updates: Partial<SharedLink>) => Promise<boolean>;
}
```

### Utilizzo

```typescript
const { links, fetchLinks, revokeLink, updateLink } = useSharedLinks();

useEffect(() => {
    fetchLinks();
}, []);

// Revoca link
await revokeLink('link_123');

// Modifica impostazioni
await updateLink('link_123', {
    expiresAt: '2026-02-01T00:00:00Z',
    maxDownloads: 10
});
```

---

## Tipo SharedLink

```typescript
interface SharedLink {
    id: string;
    fileId: string;
    fileName: string;
    s3Key: string;
    url: string;
    isPasswordProtected: boolean;
    expiresAt: string;
    maxDownloads?: number;
    downloadCount: number;
    revokedAt: string | null;
    createdAt: string;
    isEncrypted: boolean; // Link include #key=... fragment
}
```

---

## Componente: SharedLinksTable

Tabella interattiva per gestire i link:

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

```tsx
// Modifica impostazioni link
const handleSaveSettings = async () => {
    const success = await onUpdate(editingLink.id, {
        expiresAt: newExpiryDate?.toISOString(),
        maxDownloads: newMaxDownloads
    });
    
    if (success) {
        message.success('Impostazioni salvate');
        setSettingsVisible(false);
    }
};
```

### Indicatore Stato

```typescript
const renderStatus = (link: SharedLink) => {
    if (link.revokedAt) {
        return <Badge status="error" text="Revocato" />;
    }
    
    const isExpired = dayjs(link.expiresAt).isBefore(dayjs());
    if (isExpired) {
        return <Badge status="warning" text="Scaduto" />;
    }
    
    return <Badge status="success" text="Attivo" />;
};
```

---

## API Endpoints

### GET /shared-links

**Response:**
```json
{
    "data": [
        {
            "id": "link_abc123",
            "fileId": "file_xyz",
            "fileName": "document.pdf",
            "url": "https://example.com/d/abc123",
            "isPasswordProtected": true,
            "expiresAt": "2026-02-01T00:00:00Z",
            "maxDownloads": 10,
            "downloadCount": 3,
            "revokedAt": null,
            "createdAt": "2026-01-05T12:00:00Z"
        }
    ]
}
```

### POST /shared-links/:id/revoke

Revoca un link rendendolo inutilizzabile.

**Response:**
```json
{
    "success": true,
    "revokedAt": "2026-01-05T15:00:00Z"
}
```

### POST /shared-links/:id/regenerate

Genera nuovo URL mantenendo le impostazioni.

**Response:** Nuovo oggetto `SharedLink`

### PATCH /shared-links/:id

**Request:**
```json
{
    "expiresAt": "2026-03-01T00:00:00Z",
    "maxDownloads": 50,
    "password": "nuova_password"
}
```

---

## Considerazioni

1. **URL Unici** - Ogni link ha un ID univoco non indovinabile
2. **Password Hashing** - Le password sono hashate lato server
3. **Rate Limiting** - Limiti per prevenire abuse
4. **Cleanup** - Link scaduti vengono archiviati dopo 30 giorni
