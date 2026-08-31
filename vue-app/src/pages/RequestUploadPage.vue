<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import PrivacyReceipt from '@/src/components/landing/PrivacyReceipt.vue'
import { useRequestUpload } from '@/src/composables/useRequestUpload'
import { fingerprintGroups } from '@/src/crypto/fingerprint'
import { useTurnstile } from '@/src/composables/useTurnstile'

/**
 * Pagina pubblica di caricamento su una richiesta — `/richiesta/:publicToken`.
 *
 * Chi arriva qui **non ha un account** e quasi sempre non sa cos'è Novren: è il cliente di
 * un avvocato a cui è stato chiesto di mandare dei documenti. La pagina deve funzionare per
 * quella persona, senza chiederle di capire la crittografia.
 *
 * Perciò: prima cosa fare (scegli il file, scrivi chi sei), poi la spiegazione di cosa sta
 * succedendo, e l'impronta in fondo dentro un dettaglio richiudibile — visibile a chi la
 * cerca, invisibile a chi non saprebbe cosa farsene.
 *
 * ⚠️ **L'impronta la ricalcoliamo noi** sulla chiave che stiamo davvero usando per cifrare
 * (vedi `useRequestUpload`): un'impronta spedita dal server insieme alla chiave non
 * proverebbe nulla.
 */

const route = useRoute()
const publicToken = String(route.params.publicToken ?? '')

const { info, isLoadingInfo, loadError, status, progress, errorMessage, loadInfo, upload } =
  useRequestUpload(publicToken)

const {
  enabled: turnstileEnabled,
  mount: mountTurnstile,
  getToken: getTurnstileToken,
  refresh: refreshTurnstile,
} = useTurnstile()
const turnstileEl = ref<HTMLElement | null>(null)

const file = ref<File | null>(null)
const uploaderName = ref('')
const sent = ref(0)

const busy = computed(() => ['encrypting', 'uploading', 'finalizing'].includes(status.value))
const canSend = computed(
  () => !!file.value && uploaderName.value.trim().length >= 2 && !busy.value,
)

const statusLabel = computed(() => {
  switch (status.value) {
    case 'encrypting': return 'Cifratura nel tuo browser…'
    case 'uploading': return `Invio… ${progress.value}%`
    case 'finalizing': return 'Completamento…'
    default: return ''
  }
})

onMounted(async () => {
  await loadInfo()
  // Il widget vive in un iframe su un'origine dedicata: va montato dopo che la pagina
  // ha deciso di mostrare il modulo, altrimenti il contenitore non esiste ancora.
  if (turnstileEnabled && info.value) mountTurnstile(turnstileEl.value)
})

function pick(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
}

async function send() {
  if (!file.value) return
  const token = turnstileEnabled ? await getTurnstileToken() : undefined
  const ok = await upload(file.value, uploaderName.value.trim(), token)
  // Un token Turnstile si consuma: senza il refresh, il secondo file della stessa
  // sessione partirebbe con un token già speso e verrebbe respinto.
  if (turnstileEnabled) refreshTurnstile()
  if (ok) {
    sent.value += 1
    file.value = null
    // Il campo file non si azzera da solo: senza questo, il secondo invio riproporrebbe
    // il nome del primo e sembrerebbe che non sia successo nulla.
    const input = document.getElementById('request-file') as HTMLInputElement | null
    if (input) input.value = ''
  }
}

function sendAnother() {
  status.value = 'idle'
  progress.value = 0
}
</script>

<template>
  <PublicShell>
    <div class="mx-auto w-[min(620px,100%)] px-4 py-[clamp(32px,8vh,72px)]">
      <div v-if="isLoadingInfo" class="lt-card p-6 text-center text-[#6a5f8c]">Un momento…</div>

      <!-- Richiesta non utilizzabile -->
      <div v-else-if="loadError" class="lt-card p-6">
        <h1 class="m-0 text-[1.3rem] font-bold tracking-[-0.02em]">
          {{ loadError === 'gone' ? 'Questa richiesta è chiusa' : 'Richiesta non trovata' }}
        </h1>
        <p class="mt-2 text-[0.92rem] leading-relaxed text-[#6a5f8c]">
          <template v-if="loadError === 'gone'">
            Non accetta più caricamenti: può essere scaduta, essere stata chiusa da chi l'ha
            aperta, o aver raggiunto il numero massimo di file.
          </template>
          <template v-else-if="loadError === 'missing'">
            Il link non corrisponde a nessuna richiesta. Controlla di averlo copiato per intero.
          </template>
          <template v-else>
            Non siamo riusciti a contattare il servizio. Riprova fra poco.
          </template>
        </p>
        <p v-if="loadError !== 'network'" class="mt-4 text-[0.86rem] text-[#8a7fae]">
          Chiedi un link nuovo alla persona che te l'ha mandato.
        </p>
      </div>

      <!-- Conferma dopo l'invio -->
      <div v-else-if="status === 'done'" class="lt-card p-6">
        <h1 class="m-0 text-[1.3rem] font-bold tracking-[-0.02em]">File inviato</h1>
        <p class="mt-2 text-[0.92rem] leading-relaxed text-[#6a5f8c]">
          È stato cifrato su questo dispositivo prima di partire. Può aprirlo solo chi ha
          creato la richiesta.
        </p>

        <div class="mt-5">
          <PrivacyReceipt variant="send" />
        </div>

        <button type="button" class="lt-btn mt-5" @click="sendAnother">Invia un altro file</button>
      </div>

      <!-- Modulo -->
      <div v-else-if="info" class="lt-card p-6">
        <p class="m-0 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[#724cf9]">
          Richiesta di file
        </p>
        <h1 class="mt-1.5 text-[1.4rem] font-bold tracking-[-0.02em]">{{ info.title }}</h1>
        <p v-if="info.note" class="mt-2 text-[0.92rem] leading-relaxed text-[#6a5f8c]">
          {{ info.note }}
        </p>

        <div class="mt-5 flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="request-name" class="lt-label">Chi sei</label>
            <input
              id="request-name"
              v-model="uploaderName"
              class="lt-field"
              type="text"
              placeholder="Nome e cognome"
              autocomplete="name"
              :disabled="busy"
            />
            <p class="m-0 text-[0.74rem] text-[#8a7fae]">
              Serve a chi riceve per sapere da chi arriva il file. Non lo verifichiamo.
            </p>
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="request-file" class="lt-label">Il file</label>
            <input id="request-file" class="lt-field" type="file" :disabled="busy" @change="pick" />
          </div>

          <div v-if="turnstileEnabled" ref="turnstileEl" class="my-1 flex justify-center"></div>

          <p v-if="busy" class="m-0 font-mono text-[0.78rem] text-[#724cf9]">{{ statusLabel }}</p>
          <p v-if="errorMessage" class="m-0 text-[0.86rem] text-[#b4442f]">{{ errorMessage }}</p>

          <button type="button" class="lt-btn" :disabled="!canSend" @click="send">
            Invia in modo cifrato
          </button>
          <p v-if="sent > 0" class="m-0 text-center text-[0.8rem] text-[#6a5f8c]">
            Hai già inviato {{ sent }} file su questa richiesta.
          </p>
        </div>

        <hr class="my-6 border-0 border-t border-[#e6dff8]" />

        <h2 class="m-0 text-[0.98rem] font-bold tracking-[-0.01em]">Cosa succede al tuo file</h2>
        <p class="mt-1.5 text-[0.86rem] leading-relaxed text-[#6a5f8c]">
          Viene cifrato <strong class="text-[#1b1140]">qui, nel tuo browser</strong>, prima di
          partire. La chiave che lo apre viene chiusa dentro la chiave pubblica di chi ha
          aperto la richiesta: noi trasportiamo qualcosa che non possiamo leggere, e nemmeno
          volendo potremmo — la chiave per aprirlo non passa mai dai nostri server.
        </p>

        <details class="mt-4">
          <summary class="cursor-pointer font-mono text-[0.72rem] text-[#8a7fae]">
            Impronta della chiave del destinatario
          </summary>
          <p class="mt-2 font-mono text-[0.78rem] leading-relaxed text-[#1b1140]">
            <span v-for="(group, i) in fingerprintGroups(info.fingerprint)" :key="i" class="mr-2">
              {{ group }}
            </span>
          </p>
          <p class="mt-2 text-[0.8rem] leading-relaxed text-[#6a5f8c]">
            Se chi ti ha mandato il link ha pubblicato la sua impronta — nella firma email, sul
            suo sito — puoi confrontarla con questa. Se coincide, stai cifrando davvero per
            lui. Se non l'ha pubblicata, questo è solo un dato tecnico: noi la calcoliamo qui
            dalla chiave che stiamo usando, ma non possiamo garantirti che sia la sua.
          </p>
        </details>
      </div>
    </div>
  </PublicShell>
</template>
