<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminUsers } from '@/src/composables/useAdminUsers'

/**
 * Elenco e ricerca utenti di Novren (da Novren ID: solo chi ha usato Novren).
 *
 * `q` è un prefisso di email — coincide con come si cerca davvero un utente partendo da un
 * ticket di supporto. Gli account non si creano più qui: nascono in Novren ID, dalla persona
 * stessa; a chi si è già collegato si regala un piano dalla sua scheda.
 */

const router = useRouter()
const { items, cursor, isLoading, search } = useAdminUsers()

const q = ref('')
search('')

function goTo(userId: string | null) {
  if (userId) router.push(`/admin/utenti/${userId}`)
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="m-0 text-xl font-semibold text-haze-100">Utenti</h1>
        <p class="m-0 mt-1 text-sm text-haze-400">
          Cerca per email. Gli account nascono in Novren ID: qui compare chi ha usato Novren almeno una volta.
        </p>
      </div>
    </header>

    <div class="flex gap-2">
      <InputText
        v-model="q"
        placeholder="prefisso@email.it…"
        class="max-w-sm"
        @keyup.enter="search(q)"
      />
      <Button label="Cerca" size="small" :loading="isLoading" @click="search(q)" />
    </div>

    <DataTable :value="items" data-key="userId" size="small" :loading="isLoading" @row-click="(e) => goTo(e.data.userId)" class="cursor-pointer">
      <Column header="Email">
        <template #body="{ data }">
          <span class="text-sm text-haze-100">{{ data.email || '—' }}</span>
        </template>
      </Column>
      <Column header="Iscritto il">
        <template #body="{ data }">
          <span class="font-mono text-xs text-haze-400">
            {{ data.createdAt ? new Date(data.createdAt).toLocaleDateString('it-IT') : '—' }}
          </span>
        </template>
      </Column>
      <Column header="Stato">
        <template #body="{ data }">
          <div class="flex gap-1.5">
            <Tag v-if="data.suspended" value="sospeso" severity="danger" />
            <Tag v-if="data.deletionScheduledAt" value="in cancellazione" severity="warn" />
            <Tag v-if="!data.suspended && !data.deletionScheduledAt" value="attivo" severity="success" />
          </div>
        </template>
      </Column>
      <Column header="">
        <template #body="{ data }">
          <Button icon="pi pi-arrow-right" text size="small" @click.stop="goTo(data.userId)" />
        </template>
      </Column>
    </DataTable>

    <div v-if="cursor" class="flex justify-center">
      <Button label="Carica altri" text size="small" :loading="isLoading" @click="search(q, cursor)" />
    </div>
  </div>
</template>
