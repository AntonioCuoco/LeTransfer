# LeTransfer — Migrazione React → Vue 3

Piano esecutivo di migrazione. Spunta ogni task quando completato.
Per riprendere: leggi questo file, individua il primo `[ ]` non completato e di' a Claude "riprendi la migrazione dal punto X".

---

## Stack target

| Ambito | React (attuale) | Vue 3 (target) |
|---|---|---|
| Framework | React 19 | Vue 3.5 `<script setup>` |
| Bundler | Vite 6 + plugin-react | Vite 6 + `@vitejs/plugin-vue` |
| Routing | react-router 7 | vue-router 4 |
| Stato globale | 3 Context API | Pinia (3 store) |
| Server state | @tanstack/react-query | @tanstack/vue-query |
| UI | antd + @ant-design/icons | ant-design-vue + @ant-design/icons-vue |
| Form | react-hook-form | vee-validate + zod |
| Animazioni | GSAP + Three.js (R3F) | GSAP (vanilla) + Three.js (vanilla) |
| Auth / Crypto | Cognito, Web Crypto, js-cookie, axios | invariati (codice vanilla) |

Il nuovo progetto Vue vive in `/vue-app` in parallelo al React esistente fino allo switch finale.

---

## FASE 0 — Scaffold ✅

- [x] Creare `/vue-app` con struttura cartelle (`src/assets`, `components`, `composables`, `pages`, `router`, `stores`, `types`, `utils`, `constants`, `styles`)
- [x] `package.json` con tutte le dipendenze Vue
- [x] `vite.config.ts` (`@vitejs/plugin-vue` + Tailwind + alias `@/*`)
- [x] `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json`
- [x] `index.html` con `<div id="root">`
- [x] `env.d.ts` con tipi `ImportMetaEnv`
- [x] `tailwind.config.js`
- [x] `src/index.css` (Tailwind + tutti gli override antd dark)
- [x] `src/main.ts` (`createApp` + Pinia + router + VueQueryPlugin + Antd)
- [x] `src/App.vue` (root con RouterView + ThemeStore)
- [x] `npm install` — 321 pacchetti, 0 vulnerabilità
- [x] `vue-tsc --noEmit` — 0 errori
- [x] `vite build` — verde

---

## FASE 1 — Fondamenta (utils, types, constants, store Pinia)

### 1a — Tipi TypeScript
- [x] `src/types/transfer.ts` (TransferItem, TransferControl, TransferStatus…)
- [x] `src/types/waitlist.ts`
- [x] `src/types/index.ts` (DynamoDBFile, SharedLink, WrappedKeyData… tutti i tipi)

### 1b — Costanti
- [x] `src/constants/waitlist.ts` (WAITLIST_ROLE_OPTIONS, WAITLIST_BENEFITS, WAITLIST_SOCIAL_PROOF)
- [x] `src/constants/index.ts`

### 1c — Utilities (codice vanilla, quasi nessuna modifica)
- [x] `src/utils/crypto.ts`
- [x] `src/utils/recovery-key.ts`
- [x] `src/utils/bip39-wordlist.ts` (copia diretta)
- [x] `src/utils/cognitoClient.ts`
- [x] `src/utils/authUtils.ts`
- [x] `src/utils/axiosInterceptor.ts` (interceptor inizializzato in main.ts)
- [x] `src/utils/pkce.ts`
- [x] `src/utils/utils.ts` (cn, encryptPayload, getBase64)

### 1d — Store Pinia
- [x] `src/stores/theme.ts` — `useThemeStore` (isDark + toggleTheme + localStorage)
- [x] `src/stores/encryption.ts` — `useEncryptionStore` (masterKey in shallowRef, mai persistita)
- [x] `src/stores/transfer.ts` — `useTransferStore` (scheduler come `watch`, DownloadRunner come classe, UploadRunner placeholder)

---

## FASE 2 — Composables (da `src/hooks/` React) ✅

Ogni hook React → composable Vue in `src/composables/`.
Regola: `useState` → `ref`, `useEffect(fn,[])` → `onMounted`/`onUnmounted`, `useEffect(fn,deps)` → `watch`, `useRef` mutabile → variabile locale o `shallowRef`, `useCallback` → funzione normale.

- [x] `useTokenManager.ts` — refresh token 60s + listener visibilitychange/focus; anti-race via `shallowRef`; inizializzato una volta nel layout root (sostituisce `SessionManager`)
- [x] `useS3MultipartUpload.ts` — chunking, retry, AbortController, progress, concorrenza parti; poi collegare a `UploadRunner` nello store transfer
- [x] `useFileKeysAPI.ts` — save/fetch/delete wrapped file keys
- [x] `useFileFromDynamoDB.ts` — CRUD file + paginazione
- [x] `usePresignedUrl.ts` — presigned URL S3
- [x] `usePublicLink.ts` — accesso link pubblici (session token, getLinkInfo, accessLink, downloadFile)
- [x] `useSharedLinks.ts` — crea/revoca/rigenera/elimina link condivisi
- [x] `useShareFile.ts` — condivisione file con altri utenti via E2E key wrapping RSA
- [x] `useUserKeyPair.ts` — gestione keypair RSA (generazione, localStorage, backup/restore server)
- [x] `useRecoveryKeyAPI.ts` — stato e setup recovery key BIP39
- [x] `useFileDragAndDrop.ts` — drag-and-drop file con validazione MIME
- [x] `useFolderDragAndDrop.ts` — drag-and-drop cartelle con traversal FileSystemEntry ricorsivo
- [x] `useSettings.ts` — preferenze utente con merge contro DEFAULT_SETTINGS
- [x] `useSessionNotifications.ts` — sistema toast (message di ant-design-vue)
- [x] `useProfileImage.ts` — upload/delete avatar, auto-refresh 50min, custom event listener

**Nota:** `UploadRunner` in `src/stores/transfer.ts` ha ancora il corpo placeholder — da completare in Fase 3 collegandolo a `useS3MultipartUpload`.

---

## FASE 3 — Routing + Layout + Auth ✅

- [x] `src/router/index.ts` — rotte pubbliche + rotte protette + navigation guard (controlla cookie accessToken/refreshToken)
- [x] `src/components/layout/AppLayout.vue` — layout completo (sidebar + `<RouterView>`) + `useTokenManager` integrato (sostituisce SessionManager)
- [x] `src/components/layout/AppSidebar.vue` — sidebar fissa 72px con NavLink attivi, tooltip hover, logout con Swal
- [x] `src/components/layout/AppHeader.vue` — header con logo e logout (usato nelle singole pagine se necessario)
- [x] `src/components/layout/AppFooter.vue` — footer placeholder
- [x] `src/assets/logo.png` — copiato da React

---

## FASE 4 — Componenti & Pagine (~107)

Mapping chiave antd → ant-design-vue:
- `message.success/error` → `message.success/error` (API identica)
- `Modal.confirm` → `Modal.confirm` (identica)
- `<Table>` render-prop → slot scoped in Vue
- `<Tabs>` → `<a-tabs>` con slot
- `@ant-design/icons` → `@ant-design/icons-vue` (stessi nomi componenti)
- `react-hook-form` → `vee-validate` + `useForm`/`useField`

### 4a — UI Primitivi (`src/components/ui/` + `src/components/forms/`)
- [x] `PasswordInput.vue`
- [x] `BentoCard.vue`
- [x] `StatCard.vue`
- [ ] `Button.vue` (cva variants) — bassa priorità, si usa a-button
- [ ] `InputField.vue` — bassa priorità
- [ ] `RoleSelector.vue` — bassa priorità

### 4b — Core Transfer (`src/components/FileSender/`, `FileUploadStatus/`)
- [x] `FileSender/FileSender.vue` — form email + file selection + invio
- [x] `MultipartFileUploader.vue` — UI drag-drop → queue addUpload
- [x] `TransferStatusPanel.vue` — lista transfer attivi (connessa a useTransferStore)
- [x] **UploadRunner** → `UploadQueueManager.vue` (pool di 9 istanze `useS3MultipartUpload`, invisible component in AppLayout)

### 4c — Share & Link (`src/components/ShareFileModal/`, `LinkAccess/`)
- [x] `ShareFileModal.vue` — condivisione email + generazione link E2E
- [x] `LinkAccess/LinkAccessForm.vue`
- [x] `LinkAccess/FilePreviewCard.vue`
- [x] `LinkAccess/LinkExpiredError.vue`

### 4d — Settings (`src/components/Settings/`)
- [x] `settings/SettingsSection.vue`
- [x] `settings/SettingsToggle.vue`
- [x] `settings/SettingsInput.vue`
- [x] `settings/SettingsSelect.vue`
- [x] `settings/GeneralSection.vue` (profilo, password, aspetto, sicurezza + recovery key modal)
- [x] `settings/NotificationSection.vue`
- [x] `settings/IntegrationSettings.vue`
- [x] `RecoveryKeySetup.vue` (3 step: genera → salva → verifica BIP39)

### 4e — Profile components
- [x] `ProfileHeader.vue`
- [x] `FileStatsGrid.vue`
- [x] `FilesTable.vue` (a-table con azioni per riga)
- [x] `SharedLinksTable.vue` (dayjs, DatePicker, settings modal)

### 4f — Pagine
- [x] `src/pages/LoginPage.vue` (form Cognito + OAuth Google)
- [x] `src/pages/RegisterPage.vue`
- [x] `src/pages/OAuthCallback.vue`
- [x] `src/pages/Homepage.vue` (dashboard: stats, BentoGrid, FileSender)
- [x] `src/pages/Profile.vue`
- [x] `src/pages/SettingsPage.vue`
- [x] `src/pages/ShareAccessPage.vue` (accesso pubblico link `/share/:token`)

### 4f — Landing & Animazioni (bassa priorità)
- [ ] `src/components/BackgroundAnimated.vue` — Three.js vanilla (sostituisce R3F)
- [ ] `src/pages/LandingPage.vue` — GSAP ScrollTrigger in `onMounted` con cleanup `gsap.context()`
- [ ] Componenti landing: BenefitCard, SocialProof, HeroSection ecc.

---

## FASE 5 — Switch finale & Cleanup

- [x] Aggiungere `build.rollupOptions.output.manualChunks` in `vite.config.ts` per splittare ant-design-vue dal vendor bundle
- [ ] Test end-to-end completo (vedi checklist sotto)
- [ ] Copiare `.env` nella root di `vue-app` (non automatizzato — contiene secrets)
- [ ] Rimuovere progetto React dalla root (⚠️ destructiva — richiede conferma esplicita)
- [x] Aggiornare `package.json` root con gli script Vue (`npm run dev/build/preview` → `vue-app`)
- [ ] Aggiornare `.gitignore` se necessario

---

## Checklist verifica finale

Da eseguire contro il backend AWS reale:

- [ ] `npm run dev` — app parte senza errori console
- [ ] **Auth**: login email/password Cognito → token nei cookie → redirect dashboard
- [ ] **Auth**: OAuth Google → callback `/oauth2/callback` → token → dashboard
- [ ] **Auth**: refresh token automatico (aspettare/forzare scadenza accessToken)
- [ ] **Routing guard**: accesso a `/settings` senza token → redirect `/login`
- [ ] **Upload piccolo** (<100MB): barra progresso, cifratura, comparsa in lista
- [ ] **Upload grande** (>100MB): multipart, concorrenza parti rispettata (max 2 per file, max 3 file contemporanei)
- [ ] **Download**: decifratura → file integro
- [ ] **Share email**: condivisione file con altro utente via email
- [ ] **Link pubblico**: crea link con password/scadenza → apri `/share/:token` in incognito → accesso/decifratura
- [ ] **Recovery key**: setup mnemonico BIP39 + ripristino master key
- [ ] **Tema**: toggle light/dark persistito dopo refresh
- [ ] `npm run build` (vue-tsc + vite) — verde, 0 errori TS
- [ ] `npm run preview` — app funzionante da dist/

---

## Stato attuale

**Ultima sessione:** Fase 5 completata — upload wiring, AppSecurityPrompt, manualChunks, switch root package.json. `vue-tsc --noEmit` → 0 errori.

**Prossimi passi prima del go-live:**
1. Copiare `.env` in `vue-app/` (non automatizzato — contiene API keys)
2. `npm run dev` e test E2E contro il backend AWS reale (vedi checklist sopra)
3. Rimuovere il progetto React dalla root (⚠️ chiedere conferma esplicita all'utente)
4. **`LandingPage.vue`** — low priority, stub esistente
