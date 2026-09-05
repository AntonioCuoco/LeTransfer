<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { checkAdminAccess, useAdminIdentity } from '@/src/composables/useAdmin'

/**
 * Il contenitore del pannello admin.
 *
 * ⚠️ **Il router lascia entrare chiunque sia autenticato**: la vera guardia è qui, ed è
 * dichiaratamente a due stadi. `requiresAuth` (nel router) filtra chi non ha nemmeno una
 * sessione; questo componente chiama `/admin/whoami` e nasconde tutto se risponde 403.
 *
 * Perché non basta un flag nel token: il gruppo Cognito e la 2FA sono verificati **dal
 * server a ogni richiesta**, non decodificati qui — un token valido non basta a decidere
 * se mostrare il pannello, e provarci lato client sarebbe solo un'illusione di controllo
 * (ogni endpoint sotto `/admin/*` fa comunque la stessa verifica da sé).
 *
 * Il tono è volutamente diverso dal resto dell'app: qui non c'è nessuno da rassicurare,
 * c'è un operatore che deve trovare in fretta quello che cerca.
 */

const route = useRoute()
const { isAdmin } = useAdminIdentity()
const isChecking = ref(true)

onMounted(async () => {
  await checkAdminAccess()
  isChecking.value = false
})

const navItems = [
  { path: '/admin/moderazione', icon: 'pi pi-flag', label: 'Moderazione' },
  { path: '/admin/utenti', icon: 'pi pi-users', label: 'Utenti' },
  { path: '/admin/metriche', icon: 'pi pi-chart-line', label: 'Metriche' },
  { path: '/admin/registro', icon: 'pi pi-history', label: 'Registro' },
]

const isCurrent = (path: string) => route.path.startsWith(path)
</script>

<template>
  <div v-if="isChecking" class="flex min-h-screen items-center justify-center bg-deep-950 text-haze-400">
    Verifica…
  </div>

  <div v-else-if="!isAdmin" class="flex min-h-screen flex-col items-center justify-center gap-3 bg-deep-950 px-6 text-center">
    <i class="pi pi-lock text-3xl text-haze-500" />
    <h1 class="m-0 text-lg font-semibold text-haze-100">Accesso negato</h1>
    <p class="m-0 max-w-[42ch] text-sm text-haze-400">
      Questa sezione richiede un account amministratore con la verifica in due passaggi attiva.
    </p>
    <RouterLink to="/app" class="mt-2 text-sm text-brand-400 hover:underline">
      Torna all'app
    </RouterLink>
  </div>

  <div v-else class="flex min-h-screen bg-deep-950 text-haze-100">
    <aside class="flex w-56 flex-col gap-1 border-r border-white/10 bg-deep-900 p-4">
      <div class="mb-4 px-2">
        <p class="m-0 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-haze-500">Novren</p>
        <p class="m-0 text-sm font-semibold text-haze-100">Amministrazione</p>
      </div>
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="flex items-center gap-2.5 rounded-field px-3 py-2 text-sm transition-colors"
        :class="isCurrent(item.path) ? 'bg-brand-500/15 text-brand-300' : 'text-haze-300 hover:bg-white/5'"
      >
        <i :class="item.icon" class="text-[0.9rem]" />
        {{ item.label }}
      </RouterLink>
      <RouterLink
        to="/app"
        class="mt-auto flex items-center gap-2.5 rounded-field px-3 py-2 text-sm text-haze-500 hover:bg-white/5"
      >
        <i class="pi pi-arrow-left text-[0.9rem]" />
        Esci dal pannello
      </RouterLink>
    </aside>

    <main class="min-w-0 flex-1 overflow-x-hidden p-6">
      <RouterView />
    </main>
  </div>
</template>
