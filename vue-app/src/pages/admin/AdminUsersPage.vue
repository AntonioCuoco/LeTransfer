<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminUsers, PLAN_GRANT_DAYS, type PlanGrantDays } from '@/src/composables/useAdminUsers'

/**
 * Elenco e ricerca utenti.
 *
 * `q` è un prefisso di email — è ciò che Cognito sa fare senza indici nostri, e coincide
 * con come si cerca davvero un utente partendo da un ticket di supporto.
 */

const router = useRouter()
const { items, cursor, isLoading, isActing, search, createUser } = useAdminUsers()

const q = ref('')
search('')

function goTo(userId: string | null) {
  if (userId) router.push(`/admin/utenti/${userId}`)
}

const createOpen = ref(false)
const newEmail = ref('')
const grantPlanOnCreate = ref(false)
const newPlan = ref('pro')
const newDays = ref<PlanGrantDays>(30)
const createResult = ref<{ userId: string; note: string } | null>(null)

async function submitCreate() {
  const result = await createUser(
    newEmail.value.trim(),
    grantPlanOnCreate.value ? newPlan.value : undefined,
    grantPlanOnCreate.value ? newDays.value : undefined,
  )
  if (result) {
    createResult.value = result
    search(q.value)
  }
}

function closeCreate() {
  createOpen.value = false
  newEmail.value = ''
  grantPlanOnCreate.value = false
  createResult.value = null
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="m-0 text-xl font-semibold text-haze-100">Utenti</h1>
        <p class="m-0 mt-1 text-sm text-haze-400">Cerca per email, o crea un account.</p>
      </div>
      <Button label="Nuovo account" icon="pi pi-plus" size="small" @click="createOpen = true" />
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

    <Dialog v-model:visible="createOpen" modal header="Nuovo account" :style="{ width: 'min(480px, 94vw)' }" @hide="closeCreate">
      <div v-if="createResult" class="flex flex-col gap-3">
        <p class="m-0 text-sm text-haze-200">
          Credenziale creata. Cognito ha mandato l'invito con la password temporanea a
          <strong>{{ newEmail }}</strong>.
        </p>
        <p class="m-0 rounded-well border border-warn-400/25 bg-warn-400/[0.06] p-3 text-xs leading-relaxed text-haze-300">
          {{ createResult.note }}
        </p>
      </div>
      <div v-else class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-haze-300">Email</label>
          <InputText v-model="newEmail" type="email" placeholder="nome@esempio.it" fluid />
        </div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="grantPlanOnCreate" binary input-id="grant-on-create" />
          <label for="grant-on-create" class="text-sm text-haze-300">Regala subito un piano</label>
        </div>
        <div v-if="grantPlanOnCreate" class="grid grid-cols-2 gap-3">
          <Select v-model="newPlan" :options="['pro']" fluid />
          <Select v-model="newDays" :options="[...PLAN_GRANT_DAYS]" fluid />
        </div>
        <p class="m-0 text-xs leading-relaxed text-haze-500">
          Crea solo la credenziale d'accesso: le chiavi di cifratura nascono nel browser
          dell'utente al primo login, quindi non potrà ricevere file finché non entra.
        </p>
      </div>
      <template #footer>
        <Button v-if="createResult" label="Chiudi" @click="closeCreate" />
        <template v-else>
          <Button label="Annulla" text @click="closeCreate" />
          <Button label="Crea" :disabled="!newEmail.trim()" :loading="isActing" @click="submitCreate" />
        </template>
      </template>
    </Dialog>
  </div>
</template>
