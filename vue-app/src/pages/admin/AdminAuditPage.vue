<script setup lang="ts">
import { onMounted } from 'vue'
import { useAdminAudit } from '@/src/composables/useAdmin'

/**
 * Il registro globale, in sola lettura — e non esiste altro: nessuna rotta di modifica o
 * cancellazione, nemmeno per un admin. Un registro che si può correggere non è un registro.
 */
const { entries, isLoading, load } = useAdminAudit()
onMounted(() => load())
</script>

<template>
  <div class="flex flex-col gap-5">
    <header>
      <h1 class="m-0 text-xl font-semibold text-haze-100">Registro</h1>
      <p class="m-0 mt-1 text-sm text-haze-400">Ogni azione amministrativa, dalla più recente.</p>
    </header>

    <div v-if="isLoading" class="text-sm text-haze-400">Carico…</div>
    <p v-else-if="entries.length === 0" class="text-sm text-haze-500">Nessuna azione registrata.</p>

    <ul v-else class="m-0 flex flex-col gap-2 p-0">
      <li v-for="entry in entries" :key="entry.id" class="rounded-well border border-white/10 bg-white/[0.03] p-3 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-mono text-xs text-haze-500">{{ new Date(entry.at).toLocaleString('it-IT') }}</span>
          <Tag :value="entry.action" severity="secondary" />
          <span class="font-mono text-xs text-haze-400">{{ entry.targetType }}:{{ entry.targetId }}</span>
        </div>
        <p class="m-0 mt-1.5 text-xs text-haze-400">
          {{ entry.adminEmail || entry.adminId }}
          <template v-if="entry.detail?.reason"> — {{ entry.detail.reason }}</template>
        </p>
      </li>
    </ul>
  </div>
</template>
