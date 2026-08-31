<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { notify } from '@/src/utils/notify'
import { useFileRequests, requestUrl, isOpen, type FileRequest } from '@/src/composables/useFileRequests'
import { useUserKeyPair } from '@/src/composables/useUserKeyPair'

/**
 * Richieste file — la pagina di chi le apre.
 *
 * **A cosa serve.** «Mandami i documenti»: apri un link, lo dai a un cliente, lui carica
 * senza registrarsi, e i file arrivano cifrati **sulla tua chiave**. Compaiono poi fra i
 * file ricevuti come qualunque altra condivisione.
 *
 * **Il prerequisito che va detto prima, non dopo.** Chi carica cifra sulla tua chiave
 * pubblica: se non hai ancora una coppia di chiavi, la richiesta non può funzionare. Meglio
 * dirlo qui che lasciare che il cliente carichi e scopra dopo che il file non si apre.
 */

const { requests, isLoading, isSaving, isAvailable, load, create, close, remove } = useFileRequests()
const { publicKey } = useUserKeyPair()

const dialogOpen = ref(false)
const title = ref('')
const note = ref('')
const expiresInDays = ref(7)
const maxUploads = ref<number | null>(20)

const hasKeys = computed(() => !!publicKey.value)
const canCreate = computed(() => title.value.trim().length >= 3 && hasKeys.value)

onMounted(load)

async function submit() {
  const created = await create({
    title: title.value.trim(),
    note: note.value.trim() || undefined,
    expiresInHours: expiresInDays.value * 24,
    maxUploads: maxUploads.value,
  })
  if (created) {
    dialogOpen.value = false
    title.value = ''
    note.value = ''
    notify.success('Richiesta creata. Copia il link e mandalo.')
  }
}

async function copy(request: FileRequest) {
  try {
    await navigator.clipboard.writeText(requestUrl(request.publicToken))
    notify.success('Link copiato.')
  } catch {
    notify.error('Non siamo riusciti a copiare il link.')
  }
}

async function onClose(request: FileRequest) {
  if (await close(request.requestId)) notify.success('Richiesta chiusa: non accetta più file.')
}

async function onRemove(request: FileRequest) {
  if (await remove(request.requestId)) {
    notify.success('Richiesta eliminata. I file già arrivati restano fra i tuoi.')
  }
}

const stateLabel = (r: FileRequest) => {
  if (r.closedAt) return 'chiusa'
  if (new Date(r.expiresAt).getTime() <= Date.now()) return 'scaduta'
  if (r.maxUploads != null && r.uploadCount >= r.maxUploads) return 'piena'
  return 'aperta'
}
</script>

<template>
  <div class="lt-page">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="m-0 text-[clamp(1.5rem,3vw,2rem)] font-bold tracking-[-0.03em] text-haze-100">
          Richiedi file
        </h1>
        <p class="m-0 mt-1.5 max-w-[68ch] text-sm leading-relaxed text-haze-400">
          Apri un link e mandalo a chi deve inviarti dei documenti. Chi carica non deve
          registrarsi, e i file arrivano cifrati sulla tua chiave: nessuno tranne te può aprirli.
        </p>
      </div>
      <Button label="Nuova richiesta" icon="pi pi-plus" :disabled="!hasKeys" @click="dialogOpen = true" />
    </header>

    <div v-if="!hasKeys" class="mb-5 rounded-well border border-warn-400/25 bg-warn-400/[0.06] p-4">
      <p class="m-0 text-sm font-semibold text-haze-100">Prima servono le tue chiavi</p>
      <p class="m-0 mt-1 max-w-[68ch] text-xs leading-relaxed text-haze-300">
        Chi carica cifra sulla tua chiave pubblica: finché non ne hai una, una richiesta non
        potrebbe ricevere niente di leggibile. Sblocca le chiavi dalla barra laterale.
      </p>
    </div>

    <div v-if="!isAvailable" class="rounded-well border border-warn-400/25 bg-warn-400/[0.06] p-4">
      <p class="m-0 text-sm font-semibold text-haze-100">Non ancora attive</p>
      <p class="m-0 mt-1 max-w-[68ch] text-xs leading-relaxed text-haze-300">
        Le richieste file non sono ancora accese su questo ambiente. La pagina c'è, il canale no.
      </p>
    </div>

    <div v-else-if="isLoading" class="text-sm text-haze-400">Carico…</div>

    <div v-else-if="requests.length === 0" class="rounded-well border border-white/10 bg-white/[0.03] p-6 text-center">
      <p class="m-0 text-sm text-haze-300">Non hai ancora aperto nessuna richiesta.</p>
    </div>

    <div v-else class="flex flex-col gap-3">
      <article
        v-for="request in requests"
        :key="request.requestId"
        class="rounded-well border border-white/10 bg-white/[0.03] p-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="m-0 text-base font-semibold text-haze-100">{{ request.title }}</h2>
            <p v-if="request.note" class="m-0 mt-1 max-w-[68ch] text-xs leading-relaxed text-haze-400">
              {{ request.note }}
            </p>
            <p class="m-0 mt-2 font-mono text-[0.72rem] text-haze-400">
              <span :class="isOpen(request) ? 'text-verified-400' : 'text-warn-400'">
                {{ stateLabel(request) }}
              </span>
              · {{ request.uploadCount }}<template v-if="request.maxUploads">/{{ request.maxUploads }}</template>
              file · scade il {{ new Date(request.expiresAt).toLocaleDateString('it-IT') }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <Button
              v-if="isOpen(request)"
              label="Copia link"
              icon="pi pi-copy"
              text
              size="small"
              @click="copy(request)"
            />
            <Button
              v-if="isOpen(request)"
              label="Chiudi"
              text
              severity="secondary"
              size="small"
              @click="onClose(request)"
            />
            <Button
              label="Elimina"
              icon="pi pi-trash"
              text
              severity="danger"
              size="small"
              @click="onRemove(request)"
            />
          </div>
        </div>
      </article>
    </div>

    <Dialog v-model:visible="dialogOpen" modal header="Nuova richiesta" :style="{ width: 'min(520px, 94vw)' }">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label for="req-title" class="text-xs font-medium text-haze-300">Di cosa si tratta</label>
          <InputText id="req-title" v-model="title" placeholder="Documenti causa Rossi" fluid />
          <p class="m-0 text-xs text-haze-400">Lo vede chi carica: aiutalo a capire cosa mandarti.</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="req-note" class="text-xs font-medium text-haze-300">Istruzioni (facoltative)</label>
          <Textarea id="req-note" v-model="note" rows="3" auto-resize fluid />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="req-days" class="text-xs font-medium text-haze-300">Scade fra (giorni)</label>
            <InputNumber id="req-days" v-model="expiresInDays" :min="1" :max="365" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="req-max" class="text-xs font-medium text-haze-300">Massimo file</label>
            <InputNumber id="req-max" v-model="maxUploads" :min="1" :max="500" fluid />
          </div>
        </div>

        <p class="m-0 text-xs leading-relaxed text-haze-400">
          La scadenza chiude l'ingresso: i file già arrivati restano tuoi e seguono la
          conservazione del tuo piano.
        </p>
      </div>

      <template #footer>
        <Button label="Annulla" text @click="dialogOpen = false" />
        <Button label="Crea e copia il link" :disabled="!canCreate" :loading="isSaving" @click="submit" />
      </template>
    </Dialog>
  </div>
</template>
