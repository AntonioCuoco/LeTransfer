<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import axios from 'axios'
import novrenIcon from '@/src/assets/novren-icon.png'
import { clearAuthCookies } from '@/src/utils/cookieStore'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useSecurityPrompt } from '@/src/composables/useSecurityPrompt'
import { forgetMasterKey } from '@/src/crypto/rememberedDevice'
import { notify } from '@/src/utils/notify'

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

const navItems = [
  { path: '/app', icon: 'pi pi-home', label: 'Home', exact: true },
  { path: '/app/profile', icon: 'pi pi-folder', label: 'I tuoi file', exact: false },
  { path: '/app/richieste', icon: 'pi pi-inbox', label: 'Richiedi file', exact: false },
  { path: '/app/settings', icon: 'pi pi-cog', label: 'Impostazioni', exact: false },
]

const isCurrent = (item: { path: string; exact: boolean }) =>
  item.exact ? route.path === item.path : route.path.startsWith(item.path)

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
    await forgetMasterKey()
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
        <button
          v-for="item in navItems"
          :key="item.path"
          type="button"
          class="lt-rail group"
          :class="isCurrent(item) ? 'lt-rail-on' : 'lt-rail-off'"
          :aria-current="isCurrent(item) ? 'page' : undefined"
          @click="router.push(item.path)"
        >
          <i :class="item.icon" class="text-xl" />
          <span class="lt-tip">{{ item.label }}</span>
        </button>
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

@media (prefers-reduced-motion: reduce) {
  .lt-rail, .lt-tip { transition: none; }
}
</style>
