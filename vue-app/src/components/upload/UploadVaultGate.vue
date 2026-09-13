<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUploadAvailability } from '@/src/composables/useUploadAvailability'
import { useSecurityPrompt } from '@/src/composables/useSecurityPrompt'

/**
 * Patina sopra i contenitori da cui parte un upload, finché il vault non è sbloccato.
 *
 * **Perché esiste.** Un utente appena registrato non ha ancora le 24 parole, quindi non ha
 * una master key: i file che caricava arrivavano sul server cifrati con una chiave che non
 * veniva salvata da nessuna parte. Qui lo si ferma prima, e gli si dice cosa fare.
 *
 * ⚠️ È un blocco di **interfaccia**, non la garanzia: la garanzia è in useS3MultipartUpload
 * (niente upload senza vault) e nel backend (`init` senza chiave di recupero → 403,
 * `complete` senza chiave del file → 409). Questa patina serve solo a non far arrivare
 * l'utente a quegli errori.
 */

const router = useRouter()
const { availability } = useUploadAvailability()
const { requestUnlock } = useSecurityPrompt()

const isLocked = computed(() => availability.value !== 'ready')

const copy = computed(() => {
  switch (availability.value) {
    case 'needs-setup':
      return {
        title: 'Prima crea le 24 parole',
        text: 'Finché non crei la chiave di recupero non potrai caricare file: le 24 parole sono l’unico modo per riaprirli, anche per te.',
        action: 'Crea le 24 parole',
      }
    case 'locked':
      return {
        title: 'Sblocca le tue chiavi',
        text: 'Per caricare inserisci le 24 parole della chiave di recupero: servono a salvare la chiave del file, senza nessuno potrebbe più aprirlo.',
        action: 'Inserisci le 24 parole',
      }
    case 'unknown':
      return {
        title: 'Non riusciamo a verificare le tue chiavi',
        text: 'Il caricamento resta fermo finché non sappiamo dove salvare la chiave del file.',
        action: 'Ricarica la pagina',
      }
    default:
      return { title: 'Verifico le tue chiavi…', text: 'Un attimo, controllo che la chiave dei file si possa salvare.', action: null }
  }
})

function act() {
  if (availability.value === 'needs-setup') router.push({ path: '/app/settings', query: { chiave: 'crea' } })
  else if (availability.value === 'locked') requestUnlock()
  else if (availability.value === 'unknown') window.location.reload()
}
</script>

<template>
  <div class="relative" :class="isLocked ? 'min-h-[230px]' : ''">
    <div
      :class="isLocked ? 'pointer-events-none select-none opacity-25 blur-[1px]' : ''"
      :inert="isLocked || undefined"
      :aria-hidden="isLocked || undefined"
      data-testid="upload-content"
    >
      <slot />
    </div>

    <!-- La patina intercetta anche il trascinamento: senza `prevent` un file lasciato cadere
         qui sopra lo aprirebbe il browser in una nuova scheda. -->
    <div
      v-if="isLocked"
      class="absolute inset-0 z-10 grid place-items-center rounded-well bg-deep-900/70 p-5 text-center backdrop-blur-[2px]"
      role="status"
      @dragenter.prevent
      @dragover.prevent
      @drop.prevent
    >
      <div class="max-w-[38ch]">
        <i class="pi pi-lock mb-2.5 block text-2xl text-warn-400" aria-hidden="true" />
        <p class="m-0 font-semibold text-haze-100">{{ copy.title }}</p>
        <p class="m-0 mt-1.5 text-[0.84rem] leading-relaxed text-haze-300">{{ copy.text }}</p>
        <Button v-if="copy.action" class="mt-4" size="small" :label="copy.action" @click="act" />
      </div>
    </div>
  </div>
</template>
