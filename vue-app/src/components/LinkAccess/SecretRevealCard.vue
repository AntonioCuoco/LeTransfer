<script setup lang="ts">
import { ref } from 'vue'

/**
 * Un segreto (`novren secret`) aperto nel browser: testo da leggere e copiare, non un file da
 * scaricare.
 *
 * Si legge **una volta**: il server conta la lettura quando consegna il ciphertext, quindi il
 * bottone lo dice prima di premerlo. Dopo, il testo esiste solo in questa pagina.
 */

const props = defineProps<{
  /** Il segreto decifrato; `null` finché non lo si apre. */
  text: string | null
  fileName: string
  isRevealing?: boolean
}>()

const emit = defineEmits<{ reveal: [] }>()

const copied = ref(false)
const canCopy = typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'

async function copy() {
  if (!props.text || !canCopy) return
  try {
    await navigator.clipboard.writeText(props.text)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    copied.value = false
  }
}

/** Per un `.env`: lo stesso contenuto, come file, senza ricaricare niente dal server. */
function saveAsFile() {
  if (props.text == null) return
  const url = URL.createObjectURL(new Blob([props.text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = props.fileName || 'segreto.txt'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="flex flex-col gap-3" data-test="secret-card">
    <template v-if="text === null">
      <div class="rounded-[12px] border border-[#f0d9a8] bg-[#fff8e8] px-3.5 py-3 text-[0.86rem] leading-relaxed text-[#6b4a10]">
        <strong>Si legge una volta sola.</strong> Quando lo apri, il link smette di funzionare per tutti:
        tienilo a portata di mano per copiarlo dove ti serve.
      </div>
      <button type="button" class="lt-btn w-full" data-test="reveal" :disabled="isRevealing" @click="emit('reveal')">
        {{ isRevealing ? 'Decifro…' : 'Mostra il segreto' }}
      </button>
    </template>

    <template v-else>
      <pre
        class="m-0 max-h-[260px] overflow-auto whitespace-pre-wrap break-all rounded-[12px] border border-[#e9e3f6] bg-[#f5f1fd] p-3.5 font-mono text-[0.82rem] leading-relaxed text-[#1b1140]"
        data-test="secret-text"
      >{{ text }}</pre>
      <div class="flex gap-2">
        <button v-if="canCopy" type="button" class="lt-btn flex-1" data-test="copy" @click="copy">
          {{ copied ? 'Copiato' : 'Copia' }}
        </button>
        <button type="button" class="lt-btn-ghost flex-1" data-test="save" @click="saveAsFile">Salva come file</button>
      </div>
      <p class="m-0 text-center font-mono text-[0.7rem] text-[#6a5f8c]">
        il link ora non funziona più · se chiudi questa pagina il segreto non si riapre
      </p>
    </template>
  </div>
</template>
