<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import axios from 'axios'
import novrenIcon from '@/src/assets/novren-icon.png'
import { clearAuthCookies } from '@/src/utils/cookieStore'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useSecurityPrompt } from '@/src/composables/useSecurityPrompt'
import { forgetMasterKey } from '@/src/crypto/rememberedDevice'
import { getCurrentUser } from '@/src/utils/getCurrentUser'
import { notify } from '@/src/utils/notify'
import { NOVREN_PRODUCTS } from '@/src/constants/products'

/**
 * Barra laterale dell'area autenticata (roadmap F5).
 * Stessi token del mondo pubblico — il marchio è il sigillo, non il vecchio logo
 * bitmap — con in più l'indicatore dello stato del vault: sapere se le chiavi sono
 * sbloccate è informazione operativa, non decorazione.
 */

const router = useRouter()
const route = useRoute()
const encryptionStore = useEncryptionStore()
const { canUnlock, requestUnlock } = useSecurityPrompt()

interface NavLink { kind: 'link'; path: string; icon: string; label: string; exact: boolean }

/**
 * L'ordine della barra, dall'alto. «Prodotti» è una voce della lista e non un blocco a parte
 * nel template: così la sua posizione si legge e si sposta qui, insieme alle altre.
 */
const navItems: (NavLink | { kind: 'products' })[] = [
  { kind: 'link', path: '/app', icon: 'pi pi-home', label: 'Home', exact: true },
  { kind: 'link', path: '/app/profile', icon: 'pi pi-folder', label: 'I tuoi file', exact: false },
  { kind: 'link', path: '/app/richieste', icon: 'pi pi-inbox', label: 'Richiedi file', exact: false },
  { kind: 'link', path: '/app/settings', icon: 'pi pi-cog', label: 'Impostazioni', exact: false },
  { kind: 'link', path: '/app/feedback', icon: 'pi pi-comment', label: 'Feedback e aiuto', exact: false },
  { kind: 'products' },
]

const isCurrent = (item: NavLink) =>
  item.exact ? route.path === item.path : route.path.startsWith(item.path)

// ── Menu «Prodotti» ─────────────────────────────────────────────────────────────
// Non porta a nessuna pagina: si apre al passaggio del mouse (CSS), al focus da tastiera
// (CSS, solo :focus-visible — un click del mouse non deve lasciarlo bloccato aperto) e al tap — su touch l'hover non esiste, quindi serve lo stato.
const productsOpen = ref(false)
const closeProducts = () => { productsOpen.value = false }

/** Si chiude quando il focus esce dal menu, non quando passa dal bottone a una voce. */
const onProductsFocusOut = (event: FocusEvent) => {
  const menu = event.currentTarget as HTMLElement
  if (!menu.contains(event.relatedTarget as Node | null)) closeProducts()
}

// L'indicatore è una CHIAVE, non un pallino colorato: un cerchio verde non dice di
// cosa parla, e per chi non distingue verde e ambra non dice proprio niente. La
// chiave nomina l'oggetto, e lo stato "bloccato" si legge dalla forma — sbarrata —
// prima ancora che dal colore.
const vault = computed(() => {
  if (encryptionStore.isUnlocked) {
    return { label: 'Chiavi sbloccate', tip: 'Chiavi sbloccate', state: 'lt-vault-on' }
  }
  return {
    label: 'Chiavi bloccate',
    // Se c'è una chiave di recupero configurata, questo pulsante è la via di rientro
    // dopo aver chiuso il dialogo di sblocco.
    tip: canUnlock.value ? 'Chiavi bloccate — sbloccale' : 'Chiavi bloccate',
    state: 'lt-vault-off',
  }
})

const handleLogout = async () => {
  try {
    // L'accessToken è iniettato dall'interceptor axios globale (vedi decisione #8).
    await axios.post(`${import.meta.env.VITE_API_URL}/logout`, {})
  } catch {
    // si esce comunque: la pulizia locale è la parte che conta
  }

  // Chi esce non vuole lasciare i file apribili su questo browser. PRIMA dei cookie: il nome
  // del record dipende dall'utente, che si legge dall'idToken.
  try {
    await forgetMasterKey({ sub: getCurrentUser()?.sub })
  } catch {
    // IndexedDB non disponibile: non c'era niente da dimenticare.
  }

  clearAuthCookies()
  // Azzera la master key (+ cache) in RAM: nessun vault sbloccato dopo il logout.
  encryptionStore.clearMasterKey()
  notify.success('Sessione chiusa. A presto!')
  router.push('/login')
}
</script>

<template>
  <aside class="fixed left-0 top-0 z-50 flex h-screen w-[72px] flex-col items-center justify-between border-r border-white/5 bg-deep-900 px-2 py-4">
    <div class="flex w-full flex-col items-center">
      <RouterLink to="/app" class="mb-8 grid h-12 w-12 place-items-center transition-transform hover:scale-105" title="Novren">
        <img :src="novrenIcon" alt="Novren" width="44" height="23" />
      </RouterLink>

      <nav class="flex w-full flex-col items-center gap-2">
        <template v-for="item in navItems" :key="item.kind === 'link' ? item.path : item.kind">
          <button
            v-if="item.kind === 'link'"
            type="button"
            class="lt-rail group"
            :class="isCurrent(item) ? 'lt-rail-on' : 'lt-rail-off'"
            :aria-current="isCurrent(item) ? 'page' : undefined"
            @click="router.push(item.path)"
          >
            <i :class="item.icon" class="text-xl" />
            <span class="lt-tip">{{ item.label }}</span>
          </button>

          <!-- Prodotti: non una pagina, un menu che si apre sul posto -->
          <div
            v-else
            class="lt-products"
            :class="{ 'lt-products-open': productsOpen }"
            @focusout="onProductsFocusOut"
            @keydown.esc="closeProducts"
            @mouseleave="closeProducts"
          >
            <button
              type="button"
              class="lt-rail lt-rail-off"
              aria-haspopup="true"
              :aria-expanded="productsOpen"
              aria-controls="lt-products-panel"
              aria-label="Prodotti Novren"
              @click="productsOpen = !productsOpen"
            >
              <i class="pi pi-th-large text-xl" />
            </button>

            <div id="lt-products-panel" class="lt-products-panel" role="menu" aria-label="Prodotti Novren">
              <p class="lt-products-title">Prodotti Novren</p>

              <ul class="lt-products-list">
                <li v-for="product in NOVREN_PRODUCTS" :key="product.id" role="none">
                  <!-- Uscito: logo, nome e link -->
                  <a
                    v-if="product.href"
                    :href="product.href"
                    target="_blank"
                    rel="noopener"
                    role="menuitem"
                    class="lt-product lt-product-live"
                  >
                    <img v-if="product.logo" :src="product.logo" :alt="''" class="lt-product-logo" />
                    <span v-else class="lt-product-seal" aria-hidden="true">N</span>
                    <span class="lt-product-name">{{ product.name }}</span>
                    <span v-if="product.tagline" class="lt-product-tagline">{{ product.tagline }}</span>
                  </a>

                  <!-- In arrivo: niente nome, niente logo. Solo l'annuncio e il sigillo sfocato. -->
                  <div v-else class="lt-product" role="menuitem" aria-disabled="true" aria-label="Nuovo prodotto Novren in arrivo">
                    <span class="lt-product-soon">Coming soon</span>
                    <span class="lt-product-seal lt-product-seal-blur" aria-hidden="true">N</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </template>
      </nav>
    </div>

    <div class="flex w-full flex-col items-center gap-2 pt-4">
      <!-- Stato del vault: dice se puoi decifrare e, se è chiuso, è la via per riaprirlo -->
      <button
        type="button"
        class="lt-rail lt-rail-off group"
        :class="canUnlock && !encryptionStore.isUnlocked ? '' : 'cursor-default'"
        :title="vault.label"
        @click="requestUnlock"
      >
        <span class="lt-vault" :class="vault.state">
          <i class="pi pi-key text-xl" />
        </span>
        <span class="lt-tip">{{ vault.tip }}</span>
      </button>

      <button type="button" class="lt-rail lt-rail-off group hover:!text-crit-400" title="Esci" @click="handleLogout">
        <i class="pi pi-sign-out text-xl" />
        <span class="lt-tip">Esci</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
/* Il pulsante del binario e il suo tooltip: prima erano la stessa stringa di
   classi ripetuta quattro volte, con il rischio di divergere a ogni modifica. */
.lt-rail {
  position: relative;
  display: flex;
  height: 3rem;
  width: 100%;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-chip);
  transition: background-color var(--duration-quick), color var(--duration-quick);
}

.lt-rail-on {
  background: var(--color-brand-500);
  color: #fff;
  box-shadow: 0 0 14px -2px rgb(114 76 249 / 0.55);
}

.lt-rail-off { color: var(--color-haze-400); }
.lt-rail-off:hover { background: rgb(114 76 249 / 0.15); color: var(--color-haze-100); }

/* Stato del vault. Il colore resta, ma come conferma di un segno che si legge già
   da solo: menta = aperto, ambra + chiave sbarrata = chiuso. */
.lt-vault {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.lt-vault-on { color: var(--color-verified-400); }
.lt-vault-off { color: var(--color-warn-400); }

/* La sbarra del "bloccato". Il filo scuro sopra la stacca dalla chiave, altrimenti
   a 20px le due forme si impastano e non si capisce più cosa sia il segno. */
.lt-vault-off::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1.5rem;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
  box-shadow: 0 -3px 0 -1px var(--color-deep-900);
  transform: translate(-50%, -50%) rotate(-45deg);
}

/* Il colore del vault è informazione, non stato di hover: lo schiarimento delle
   voci di navigazione non lo tocca (il colore è sullo span, non ereditato). Resta
   solo un accenno di risposta al passaggio del mouse. */
.lt-rail-off:hover .lt-vault-on { color: var(--color-verified-300); }

.lt-tip {
  position: absolute;
  left: calc(100% + 12px);
  z-index: 1000;
  white-space: nowrap;
  border-radius: var(--radius-badge);
  background: var(--color-deep-800);
  padding: 0.5rem 0.75rem;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-haze-100);
  box-shadow: var(--shadow-header);
  opacity: 0;
  visibility: hidden;
  transform: translateX(-4px);
  transition: opacity var(--duration-quick), transform var(--duration-quick);
  pointer-events: none;
}

.lt-tip::before {
  content: '';
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-right-color: var(--color-deep-800);
}

.group:hover .lt-tip {
  opacity: 1;
  visibility: visible;
  transform: translateX(0);
}

/* ── Menu «Prodotti» ──────────────────────────────────────────────────────────
   Stessa superficie e stessa freccia del tooltip: è lo stesso oggetto, solo più grande. */
.lt-products {
  position: relative;
  width: 100%;
}

.lt-products-panel {
  position: absolute;
  top: 50%;
  left: calc(100% + 12px);
  z-index: 1000;
  width: 15rem;
  border-radius: var(--radius-panel);
  background: var(--color-deep-800);
  border: 1px solid rgb(255 255 255 / 0.06);
  padding: 0.9rem;
  box-shadow: 0 18px 40px -18px rgb(0 0 0 / 0.7);
  opacity: 0;
  visibility: hidden;
  transform: translate(-4px, -50%);
  transition: opacity var(--duration-quick), transform var(--duration-quick), visibility var(--duration-quick);
}

/* Il ponte sui 12px di vuoto fra bottone e pannello: senza, il mouse esce dal menu
   mentre lo attraversa e il pannello si chiude prima di poterlo raggiungere. */
.lt-products-panel::after {
  content: '';
  position: absolute;
  right: 100%;
  top: 0;
  width: 14px;
  height: 100%;
}

.lt-products-panel::before {
  content: '';
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-right-color: var(--color-deep-800);
}

.lt-products:hover .lt-products-panel,
.lt-products:has(:focus-visible) .lt-products-panel,
.lt-products-open .lt-products-panel {
  opacity: 1;
  visibility: visible;
  transform: translate(0, -50%);
}

/* Il bottone resta acceso finché il suo menu è aperto: si vede da dove viene il pannello. */
.lt-products:hover > .lt-rail,
.lt-products:has(:focus-visible) > .lt-rail,
.lt-products-open > .lt-rail {
  background: rgb(114 76 249 / 0.15);
  color: var(--color-haze-100);
}

.lt-products-title {
  margin: 0 0 0.75rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-haze-400);
}

.lt-products-list {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lt-product {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  border-radius: var(--radius-well);
  background: rgb(255 255 255 / 0.03);
  border: 1px dashed rgb(255 255 255 / 0.08);
  padding: 0.9rem 0.75rem 1rem;
  text-align: center;
  cursor: default;
}

.lt-product-live {
  border-style: solid;
  cursor: pointer;
  text-decoration: none;
  transition: background-color var(--duration-quick), border-color var(--duration-quick);
}

.lt-product-live:hover,
.lt-product-live:focus-visible {
  background: rgb(114 76 249 / 0.15);
  border-color: rgb(114 76 249 / 0.4);
}

.lt-product-soon {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-brand-300);
}

/* Il sigillo: il quadrato con la N che, al lancio, lascerà il posto al logo vero. */
.lt-product-seal {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: var(--radius-control);
  background: linear-gradient(135deg, var(--color-brand-400), var(--color-brand-700));
  font-size: 1.6rem;
  font-weight: 700;
  color: #fff;
  box-shadow: 0 8px 22px -10px rgb(114 76 249 / 0.8);
}

/* Sfocato quanto basta a far capire che c'è qualcosa, non abbastanza da sparire. */
.lt-product-seal-blur {
  filter: blur(3px);
  opacity: 0.75;
  user-select: none;
}

.lt-product-logo {
  width: 3.5rem;
  height: 3.5rem;
  object-fit: contain;
}

.lt-product-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--color-haze-100);
}

.lt-product-tagline {
  margin-top: -0.35rem;
  font-size: 0.75rem;
  color: var(--color-haze-400);
}

@media (prefers-reduced-motion: reduce) {
  .lt-rail, .lt-tip, .lt-products-panel, .lt-product-live { transition: none; }
}
</style>
