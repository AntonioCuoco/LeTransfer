<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * La carta della «consegna» (vedi `utils/linkHandoff.ts`): il mittente ha inquadrato il QR
 * di `novren send` e da questo telefono vuole far arrivare il link a qualcuno.
 *
 * «Inoltra» apre il menu di condivisione del sistema (Web Share API): WhatsApp, Telegram,
 * Mail, AirDrop, Messaggi — i canali li conosce il telefono, non noi. Dove non c'è (desktop,
 * pagina non HTTPS) resta «Copia link»; e dove non c'è nemmeno quello, il link in un campo da
 * selezionare a mano.
 *
 * Scaricare resta possibile, ma è la terza scelta: chi inquadra il QR del proprio invio di
 * solito il file ce l'ha già.
 */

const props = defineProps<{
  /** Il link da inoltrare, già senza il segnale `via=qr`. */
  link: string
  fileName: string
}>()

const emit = defineEmits<{ download: [] }>()

// Web Share e Clipboard esistono solo in un contesto sicuro (HTTPS o localhost).
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
const canCopy = typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'

const copied = ref(false)
const showManual = ref(!canShare && !canCopy)

const message = computed(() =>
  props.fileName ? `Ti ho mandato «${props.fileName}» con Novren` : 'Ti ho mandato un file con Novren',
)

async function share() {
  try {
    await navigator.share({ title: props.fileName || 'Novren', text: message.value, url: props.link })
  } catch (error) {
    // Chiudere il menu senza scegliere non è un errore. Qualunque altra cosa (permesso
    // negato, contenuto rifiutato): si ripiega sulla copia, che almeno funziona.
    if ((error as DOMException)?.name !== 'AbortError') showManual.value = true
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(props.link)
    copied.value = true
    setTimeout(() => (copied.value = false), 2500)
  } catch {
    showManual.value = true
  }
}

function selectAll(event: Event) {
  ;(event.target as HTMLInputElement).select()
}
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <button v-if="canShare" type="button" class="lt-btn w-full" data-test="share" @click="share">
      Inoltra
    </button>

    <button
      v-if="canCopy"
      type="button"
      :class="canShare ? 'lt-btn-ghost w-full' : 'lt-btn w-full'"
      data-test="copy"
      @click="copy"
    >
      {{ copied ? 'Link copiato ✓' : 'Copia link' }}
    </button>

    <div v-if="showManual" class="flex flex-col gap-1.5">
      <input
        :value="link"
        readonly
        aria-label="Link da inoltrare"
        data-test="manual"
        class="w-full rounded-[10px] border border-[#e0d8f3] bg-[#f7f4fd] px-3 py-2 font-mono text-[0.72rem] text-[#1b1140]"
        @focus="selectAll"
      />
      <p class="m-0 font-mono text-[0.68rem] text-[#6a5f8c]">tieni premuto sul link per copiarlo</p>
    </div>

    <button type="button" class="lt-btn-ghost w-full" data-test="download" @click="emit('download')">
      Scarica su questo telefono
    </button>

    <p class="m-0 px-1 pt-1 font-mono text-[0.68rem] leading-relaxed text-[#6a5f8c]">
      chi ha il link apre il file · aprire questa pagina non conta come download
    </p>
  </div>
</template>
