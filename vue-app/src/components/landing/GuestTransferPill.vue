<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGuestUploadStore } from '@/src/stores/guestUpload'

/**
 * La pillola che segue l'invio quando non sei più sulla facciata.
 *
 * È la metà visibile dell'upload in background: lo stato vive nello store, ma senza
 * qualcosa che lo mostri "in background" significherebbe soltanto "invisibile". Serve
 * a due cose, e solo a quelle: dire che stai ancora cifrando mentre leggi un'altra
 * pagina, e dire che **il link è pronto** — che è il momento in cui l'invio sarebbe
 * andato perso, prima.
 *
 * Non compare sulla facciata: lì la carta racconta già tutto, e due progressi
 * contemporanei sono rumore, non rassicurazione.
 */

const router = useRouter()
const route = useRoute()
const { status, progress, isBusy } = storeToRefs(useGuestUploadStore())

const onLanding = computed(() => route.path === '/')
const visible = computed(() => !onLanding.value && (isBusy.value || status.value === 'done'))
const ready = computed(() => status.value === 'done')

const label = computed(() => {
  if (ready.value) return 'Link pronto'
  if (status.value === 'preparing') return 'Genero la chiave…'
  if (status.value === 'finalizing') return 'Creo il link…'
  return `Cifro e carico — ${progress.value}%`
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-200 ease-in"
    leave-to-class="translate-y-3 opacity-0"
  >
    <button
      v-if="visible"
      type="button"
      class="fixed bottom-5 right-5 z-50 flex w-[min(280px,calc(100vw-2.5rem))] flex-col gap-2 rounded-[14px] border border-white/15 bg-[#1b1140]/95 p-3 text-left shadow-[0_18px_40px_-18px_rgba(8,2,24,0.9)] backdrop-blur transition-colors hover:border-white/30"
      :aria-label="ready ? 'Il link è pronto: torna all\'invio' : 'Invio in corso: torna alla facciata'"
      @click="router.push('/')"
    >
      <div class="flex items-center gap-2.5">
        <span
          class="grid h-[22px] w-[22px] flex-none place-items-center rounded-full"
          :class="ready ? 'bg-[#12b89a]' : 'bg-[#724cf9]'"
        >
          <svg v-if="ready" viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="#fff" stroke-width="3">
            <path d="m5 13 5 5L19 7" />
          </svg>
          <svg v-else viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="#fff" stroke-width="2.4">
            <rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
        <span class="flex-1 truncate font-mono text-[0.74rem] text-[#F2ECFF]" role="status" aria-live="polite">
          {{ label }}
        </span>
      </div>

      <!-- La barra resta anche a invio finito, piena: è la conferma che è arrivato in fondo. -->
      <div class="h-1 overflow-hidden rounded-full bg-white/15">
        <div
          class="h-full rounded-full transition-all duration-200"
          :class="ready ? 'bg-[#12b89a]' : 'bg-[linear-gradient(90deg,#7c4dff,#37e7c4)]'"
          :style="{ width: `${ready ? 100 : progress}%` }"
        />
      </div>

      <span class="font-mono text-[0.64rem] text-[#8d7fb8]">
        {{ ready ? 'torna all’invio per copiarlo →' : 'puoi continuare a navigare' }}
      </span>
    </button>
  </Transition>
</template>
