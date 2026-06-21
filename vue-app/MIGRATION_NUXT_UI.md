# Migrazione UI: ant-design-vue → Nuxt UI v3

Documento operativo per sostituire **ant-design-vue** con **Nuxt UI** (v3, standalone Vue + Vite).
Obiettivo: look moderno e coerente, stile via utility-class Tailwind v4 (già in uso), fine della guerra di `!important` sul tema.

> Le due librerie possono **coesistere** durante la migrazione. Non è un big-bang: si installa Nuxt UI, si configura, e si convertono i componenti file per file finché ant-design non è più referenziato. Solo allora si disinstalla.

---

## 1. Perché Nuxt UI

- Il progetto è **già su Tailwind v4** (`@tailwindcss/vite`) → Nuxt UI v3 è nativo Tailwind v4.
- Componenti accessibili (Reka UI / Radix port), 125+, MIT, manutenzione di prim'ordine.
- Si stila con le stesse utility-class già usate ovunque nel codice.
- API già nota a chi sviluppa (uso pregresso con Nuxt).

---

## 2. Setup iniziale (Fase 0 — una volta sola)

### 2.1 Dipendenze
```bash
npm install @nuxt/ui
# icone (Nuxt UI usa Iconify per le prop :icon)
npm install -D @iconify-json/lucide
```
`tailwindcss` v4 è già presente.

### 2.2 `vite.config.ts`
Aggiungere il plugin Nuxt UI:
```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'   // ← nuovo
import path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    ui({
      ui: {
        colors: {
          primary: 'brand',   // colore custom definito in CSS (vedi 2.4)
          neutral: 'zinc',
        },
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './') } },
  // il blocco build.rollupOptions.manualChunks andrà aggiornato: rimuovere
  // 'ant-design' dai chunk a fine migrazione.
})
```
> NB: `@tailwindcss/vite` e il plugin `ui()` di Nuxt UI possono confliggere sull'ordine. La guida Nuxt UI per Vite include già Tailwind: se dopo il setup gli stili non si applicano, rimuovere `@tailwindcss/vite` e lasciare che sia `ui()` a gestire Tailwind (Nuxt UI lo incapsula).

### 2.3 `src/main.ts`
```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import ui from '@nuxt/ui/vue-plugin'   // ← sostituisce Antd
import './index.css'
import App from './App.vue'
import router from './router'
import { initializeAxiosInterceptors } from './utils/axiosInterceptor'

initializeAxiosInterceptors()
const queryClient = new QueryClient({})

createApp(App)
  .use(createPinia())
  .use(router)
  .use(VueQueryPlugin, { queryClient })
  .use(ui)               // ← era .use(Antd)
  .mount('#root')
```
Rimuovere `import Antd from 'ant-design-vue'` e `import 'ant-design-vue/dist/reset.css'`.

### 2.4 `src/index.css`
```css
@import "tailwindcss";
@import "@nuxt/ui";

/* Palette brand: mappa il colore "primary" di Nuxt UI sul viola LeTransfer.
   Nuxt UI usa scale tipo Tailwind (50..950). #724CF9 ≈ violet; qui i valori
   custom per matchare il brand esatto. */
@theme {
  --color-brand-50:  #f1ecff;
  --color-brand-100: #e3d9ff;
  --color-brand-200: #c7b3ff;
  --color-brand-300: #a88dfb;
  --color-brand-400: #8e6bfa;
  --color-brand-500: #724CF9;   /* primario */
  --color-brand-600: #5a3fd1;
  --color-brand-700: #4731a3;
  --color-brand-800: #342376;
  --color-brand-900: #221649;
  --color-brand-950: #150d2e;
}

/* Forziamo la modalità scura come default app (la UI è disegnata dark). */
:root { color-scheme: dark; }
```
> Tutti gli override `.ant-*` precedenti sono già stati rimossi: il file è pulito.

### 2.5 `src/App.vue`
Rimuovere `a-config-provider` e il `theme` di ant. Avvolgere tutto in `<UApp>` (fornisce il contesto per **toast**, **tooltip** e overlay — obbligatorio):
```vue
<script setup lang="ts">
import { RouterView } from 'vue-router'
// niente più import da ant-design-vue
</script>

<template>
  <UApp>
    <div class="w-[100dvw] h-[100dvh] bg-[#2c2638] dark">
      <RouterView />
    </div>
  </UApp>
</template>
```

### 2.6 Icone
`@ant-design/icons-vue` **continua a funzionare** (sono semplici componenti SVG, indipendenti dal tema ant). Strategia:
- Dove le icone sono usate **inline nel template** (`<FileOutlined />`) → lasciarle, migrazione opzionale.
- Dove servono nelle **prop dei componenti Nuxt UI** (`<UButton icon="i-lucide-..." />`) → usare stringhe Iconify lucide.
- Migrazione completa a lucide consigliata ma **non bloccante**: si può fare in coda.

---

## 3. Mappa componenti ant → Nuxt UI

| ant-design-vue | Nuxt UI | Note |
|---|---|---|
| `a-config-provider` | `<UApp>` + config plugin | tema via CSS vars, non più runtime token |
| `a-button` | `UButton` | `type="primary"`→`color="primary"`; `type="text"`→`variant="ghost"`; `danger`→`color="error"`; `:loading`, `:disabled` uguali; icona via `icon="i-lucide-..."` o slot |
| `a-modal` | `UModal` | `:open`→`v-model:open`; titolo/footer via slot `#header`/`#body`/`#footer` o `#content`; `centered` è default |
| `a-input` | `UInput` | `v-model:value`→`v-model`; placeholder uguale |
| `a-input-password` | `UInput type="password"` | nessun toggle occhio integrato → aggiungere bottone trailing custom (vedi PasswordInput già esistente) |
| `a-input-number` | `UInputNumber` | `v-model:value`→`v-model`; `:min`/`:max` uguali |
| `a-textarea` | `UTextarea` | `v-model:value`→`v-model`; `:rows` uguale |
| `a-switch` | `USwitch` | `v-model:checked`→`v-model` |
| `a-select` + `a-select-option` | `USelect` (o `USelectMenu` se ricercabile) | niente `<a-select-option>`: si passa `:items="[{label,value}]"`; `v-model:value`→`v-model` |
| `a-tabs` + `a-tab-pane` | `UTabs` | `:items="[{label,slot,...}]"` + slot per contenuto; non più `<a-tab-pane>` |
| `a-tooltip` | `UTooltip` | `title`→`text` (o slot `#content`); wrappa il trigger nel default slot |
| `a-popconfirm` | `UPopover` + bottoni conferma | nessun equivalente diretto → pattern popover con "Conferma/Annulla" (vedi 4.4) |
| `a-badge` (dot) | `UChip` / `UBadge` | per pallino+testo stato: custom o `UBadge` con `color` |
| `a-tag` | `UBadge` | `color` + `variant` |
| `a-pagination` | `UPagination` | `v-model:current`→`v-model:page`; `:total`, `:page-size` |
| `a-spin` | `USkeleton` / `UButton loading` / icona animata | per overlay caricamento usare skeleton o spinner custom |
| `a-steps` | `UStepper` | `:items`; `:current`→`v-model` (verificare API in fase di conversione) |
| `a-date-picker` | `UInputDate` o `UPopover`+`UCalendar` | **cambio di tipo date**: usa `@internationalized/date` (`CalendarDate`), non `dayjs` (vedi 4.2) |
| `a-table` | `UTable` | **rework**: colonne TanStack (`accessorKey`/`header`/`cell` con render); celle custom via slot `#<col>-cell` (vedi 4.1) |
| `message.*` (import) | `useToast()` | `message.error(x)`→`toast.add({title:x,color:'error'})` (vedi 4.3) |
| `Modal.confirm` (import) | `useOverlay()` o `<UModal>` dichiarativo | refactor del confirm imperativo (vedi 4.5) |

---

## 4. Casi speciali (i punti che richiedono lavoro vero)

### 4.1 Tabelle — `a-table` → `UTable`  *(il pezzo più grosso)*
File: `FilesTable.vue`, `SharedLinksTable.vue`.

`UTable` è basato su **TanStack Table**. Differenze chiave:
- Le colonne diventano `{ accessorKey, header, cell }`. Le celle custom (icone, badge, azioni, tooltip) si fanno con gli **slot** `#<column>-cell="{ row }"` invece del template unico `#bodyCell`.
- `row-key` → `getRowId` o `accessorKey` `id`.
- `:pagination="false"` → niente, la paginazione è opt-in.
- `:data-source` → `:data`.

Esempio (scheletro per FilesTable):
```vue
<script setup lang="ts">
const columns = [
  { accessorKey: 'name', header: 'File' },
  { accessorKey: 'type', header: 'Tipo' },
  { accessorKey: 'size', header: 'Dimensione' },
  { accessorKey: 'status', header: 'Stato' },
  { accessorKey: 'date', header: 'Data' },
  { id: 'actions', header: 'Azioni' },
]
</script>
<template>
  <UTable :data="files" :columns="columns">
    <template #name-cell="{ row }">
      <div class="flex items-center gap-2">
        <component :is="getFileIcon(row.original.type)" class="text-white" />
        <span class="font-medium text-white truncate">{{ decodeURIComponent(row.original.name) }}</span>
      </div>
    </template>
    <template #actions-cell="{ row }">
      <!-- bottoni download/share/delete -->
    </template>
  </UTable>
</template>
```
Stimare ~2-3h a tabella per riportare tutte le celle custom.

### 4.2 Date picker — cambio di libreria date
File: `SharedLinksTable.vue` (modale impostazioni, `a-date-picker` con `dayjs`).

Nuxt UI usa **`@internationalized/date`** (`CalendarDate`), non `dayjs`. Serve:
```bash
npm install @internationalized/date
```
- Convertire `dayjs` ↔ `CalendarDate` al confine (lettura/scrittura della scadenza).
- UI: `UPopover` + `UCalendar` (o `UInputDate`).
- `dayjs` resta comunque usato per `fromNow()`/formattazione nelle celle: si può **tenere dayjs** per il display e usare `CalendarDate` solo nel picker. Conversione: `dayjs(cal.toDate(getLocalTimeZone()))` e viceversa.

### 4.3 Notifiche — `message` → `useToast`  *(diffuso, ~17 file)*
ant `message` è un singleton globale chiamabile ovunque. Nuxt UI `useToast()` va chiamato **in contesto setup** e il riferimento va **catturato in cima**, non dentro callback async (perderebbe il contesto inject).

Centralizzare nel composable già esistente `useSessionNotifications.ts`:
```ts
// useSessionNotifications.ts
export const useSessionNotifications = () => {
  const toast = useToast()   // catturato in setup
  return {
    showSuccess: (m: string) => toast.add({ title: m, color: 'success' }),
    showError:   (m: string) => toast.add({ title: m, color: 'error' }),
    showWarning: (m: string) => toast.add({ title: m, color: 'warning' }),
    showInfo:    (m: string) => toast.add({ title: m, color: 'info' }),
  }
}
```
Poi nei file: sostituire `import { message } from 'ant-design-vue'` + `message.error(x)` con il composable.
**Attenzione ai store/composable non-setup** (`encryption.ts`, `transfer.ts`, `useFileKeysAPI.ts`, ecc.): se `message` è chiamato dentro funzioni async lontane dal setup, va passato il `toast`/notifier dall'esterno o catturato all'inizializzazione dello store (setup store → `useToast()` in cima funziona). Verificare caso per caso.

### 4.4 Popconfirm — `a-popconfirm` → pattern UPopover
File: `SharedLinksTable.vue`, `FilesTable.vue`.
Nessun equivalente 1:1. Pattern:
```vue
<UPopover>
  <UButton color="error" variant="ghost" icon="i-lucide-trash-2" />
  <template #content>
    <div class="p-3 space-y-2">
      <p class="text-sm">Eliminare il file?</p>
      <div class="flex justify-end gap-2">
        <UButton size="xs" variant="ghost" @click="...">No</UButton>
        <UButton size="xs" color="error" @click="onConfirm">Sì</UButton>
      </div>
    </div>
  </template>
</UPopover>
```

### 4.5 Modal imperativo — `Modal.confirm`
File: `ShareFileModal.vue`, `GeneralSection.vue`, `SettingsPage.vue`.
Sostituire i `Modal.confirm({...})` imperativi con `<UModal v-model:open>` dichiarativo (stato locale) o `useOverlay()`. Il primo è più semplice/leggibile.

---

## 5. File da toccare (checklist)

### Setup (Fase 0)
- [ ] `package.json` (deps)
- [ ] `vite.config.ts`
- [ ] `src/main.ts`
- [ ] `src/index.css`
- [ ] `src/App.vue`

### Componenti UI (Fase 1 — facili, mapping diretto)
- [ ] `components/settings/SettingsInput.vue` (input)
- [ ] `components/settings/SettingsSelect.vue` (select)
- [ ] `components/settings/SettingsToggle.vue` (switch + tooltip)
- [ ] `components/MultipartFileUploader.vue` (button)
- [ ] `components/LinkAccess/LinkExpiredError.vue` (button)
- [ ] `components/LinkAccess/LinkAccessForm.vue` (button)
- [ ] `components/LinkAccess/FilePreviewCard.vue` (button)
- [ ] `components/FileSender/FileSender.vue` (button, tag, textarea)
- [ ] `pages/OAuthCallback.vue` (spin)
- [ ] `pages/ShareAccessPage.vue` (spin)

### Form/modali (Fase 2 — medi)
- [ ] `components/AppSecurityPrompt.vue` (modal, textarea, button)
- [ ] `components/RecoveryKeySetup.vue` (steps, textarea, button)
- [ ] `components/ShareFileModal.vue` (modal, switch, input-password, input-number, button, **Modal.confirm**)
- [ ] `components/settings/GeneralSection.vue` (button, **Modal**)
- [ ] `pages/LoginPage.vue` (modal) — *+ ritocchi UX già discussi (bottoni, i18n)*
- [ ] `pages/RegisterPage.vue` (modal)
- [ ] `pages/Homepage.vue` (modal, input, button, tooltip)
- [ ] `pages/SettingsPage.vue` (tabs, button, spin, **Modal**)
- [ ] `pages/Profile.vue` (tabs, select, button, spin, pagination, modal)

### Complessi (Fase 3)
- [ ] `components/FilesTable.vue` (**a-table → UTable**)
- [ ] `components/SharedLinksTable.vue` (**a-table → UTable**, **a-date-picker**, popconfirm)

### Notifiche (Fase 4 — trasversale)
- [ ] `composables/useSessionNotifications.ts` (hub toast)
- [ ] Sostituire `message` in: `AppSecurityPrompt`, `FileSender`, `useFileKeysAPI`, `useRecoveryKeyAPI`, `useSharedLinks`, `useUserKeyPair`, `ShareFileModal`, `useS3MultipartUpload`, `useSettings`, `SharedLinksTable`, `RecoveryKeySetup`, `Homepage`, `encryption` (store), `transfer` (store), `Profile`, `SettingsPage`, `ShareAccessPage`

### Pulizia finale (Fase 5)
- [ ] Rimuovere `ant-design-vue` da `package.json` e `npm uninstall ant-design-vue`
- [ ] Rimuovere `'ant-design'` da `manualChunks` in `vite.config.ts`
- [ ] (Opzionale) Migrare `@ant-design/icons-vue` → `@iconify-json/lucide`
- [ ] (Opzionale) Valutare se sostituire anche `sweetalert2` (Swal) con toast/modal Nuxt UI per coerenza
- [ ] `grep` finale: nessun `a-`, nessun `from 'ant-design-vue'` residuo
- [ ] `npm run build` + verifica visiva di ogni pagina

---

## 6. Ordine di esecuzione consigliato
1. **Fase 0** (setup) — installa, configura, `<UApp>`, palette. App deve ancora buildare (ant e Nuxt UI coesistono).
2. **Fase 4** (toast hub) — fai subito `useSessionNotifications` su `useToast`, così i nuovi componenti lo usano già.
3. **Fase 1** (componenti facili) — prendi confidenza, basso rischio.
4. **Fase 2** (form/modali) — qui sistemiamo anche i ritocchi UX (login, empty states, contrasti).
5. **Fase 3** (tabelle + date picker) — il blocco più impegnativo, isolato e testabile.
6. **Fase 5** (pulizia) — rimozione ant, build, QA visivo.

---

## 7. Rischi / punti aperti
- **`@tailwindcss/vite` vs plugin `ui()`**: possibile conflitto di setup Tailwind → da risolvere in Fase 0 (vedi nota 2.2).
- **`UTable`/TanStack**: API colonne diversa, più verbosa per celle custom — è il costo principale.
- **Date**: passaggio `dayjs` → `@internationalized/date` solo nel picker; tenere dayjs per il display.
- **`useToast` fuori da setup** negli store/composable async — verificare la cattura del riferimento.
- **`UStepper`**: confermare API esatta (`v-model` vs `:current`) in fase di conversione di `RecoveryKeySetup`.
- **Icone**: scelta se tenere ant-icons (zero churn) o passare a lucide (coerenza). Non bloccante.

---

*Stima complessiva: 1–2 giornate di lavoro focalizzato. Coesistenza garantita → si può fermare/riprendere a ogni fase senza rompere l'app.*
