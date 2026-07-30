<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import KeyFingerprint from '@/src/components/ui/KeyFingerprint.vue'
import BrandSeal from '@/src/components/landing/BrandSeal.vue'
import { useVerifiedKeys, type VerificationState } from '@/src/composables/useVerifiedKeys'

/**
 * Verifica dell'impronta del destinatario prima di consegnargli la chiave del file
 * (roadmap F2). Tre stati, tre toni diversi:
 *
 *  • new     → prima volta: invito calmo a confrontarla fuori da qui, si può rimandare
 *  • known   → già verificata e invariata: conferma discreta, nessun ostacolo
 *  • changed → l'impronta è CAMBIATA: allarme, e il proseguimento non è preselezionato
 *
 * Il caso `changed` è l'unica ragione per cui questa schermata esiste. Trattarlo
 * come gli altri due (o peggio, nasconderlo) svuoterebbe di senso tutta la funzione.
 */

const props = defineProps<{
  visible: boolean
  email: string
  thumbprint: string
  state: VerificationState
  /** ISO della verifica precedente, se esiste. Lo calcola il chiamante: qui non si legge storage. */
  verifiedAt?: string | null
}>()

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const { markVerified } = useVerifiedKeys()

const acknowledged = ref(false)

// Su impronta cambiata si riparte sempre da "non confermato": nessun consenso per inerzia.
watch(() => props.visible, (isOpen) => { if (isOpen) acknowledged.value = false })

const previousVerification = computed(() => {
  if (!props.verifiedAt) return null
  return new Date(props.verifiedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
})

const canProceed = computed(() => props.state !== 'changed' || acknowledged.value)

async function confirm() {
  if (!canProceed.value) return
  await markVerified(props.email, props.thumbprint)
  emit('confirm')
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :closable="false"
    :style="{ width: 'min(520px, 94vw)' }"
    :pt="{ root: '!rounded-card !border-0 !bg-lilac-50 !text-ink-900 !p-2.5', header: '!hidden', content: '!bg-transparent !p-0' }"
    @update:visible="!$event && emit('cancel')"
  >
    <div class="flex items-center justify-between px-3.5 pb-3 pt-3.5">
      <div class="flex items-center gap-2.5 text-[1.04rem] font-bold tracking-[-0.01em]">
        <BrandSeal :size="19" :variant="state === 'known' ? 'check' : 'plain'" />
        {{ state === 'changed' ? 'La chiave è cambiata' : 'Verifica il destinatario' }}
      </div>
      <div
        class="font-mono text-[0.66rem] font-semibold tracking-[0.04em]"
        :class="state === 'changed' ? 'text-crit-600' : state === 'known' ? 'text-verified-600' : 'text-brand-500'"
      >
        {{ state === 'changed' ? 'attenzione' : state === 'known' ? 'già verificata' : 'prima volta' }}
      </div>
    </div>

    <div class="px-2.5 pb-2.5">
      <!-- Impronta cambiata: il motivo per cui questa schermata esiste -->
      <div v-if="state === 'changed'" class="mb-3.5 rounded-field border border-crit-200 bg-crit-100 p-3.5">
        <p class="mb-2 text-[0.9rem] font-bold text-crit-600">L'impronta di {{ email }} non è più quella di prima.</p>
        <p class="text-[0.86rem] leading-relaxed text-ink-700">
          Può succedere legittimamente: la persona ha cambiato dispositivo o rigenerato le chiavi.
          Ma è anche esattamente ciò che si vedrebbe se qualcuno stesse sostituendo la sua chiave
          per leggere il file. <b>Prima di proseguire, sentila per un'altra via</b> e fatti leggere l'impronta.
        </p>
        <p v-if="previousVerification" class="mt-2 font-mono text-[0.72rem] text-ink-400">
          verificata il {{ previousVerification }}
        </p>
      </div>

      <div v-else-if="state === 'new'" class="mb-3.5">
        <p class="text-[0.9rem] leading-relaxed text-ink-700">
          Stai per consegnare la chiave del file a <b>{{ email }}</b>. Se il file è delicato,
          leggigli queste coppie al telefono o di persona: devono coincidere con quelle che vede lui.
        </p>
      </div>

      <div v-else class="mb-3.5">
        <p class="text-[0.9rem] leading-relaxed text-ink-700">
          L'impronta di <b>{{ email }}</b> coincide con quella che avevi verificato
          <template v-if="previousVerification">il {{ previousVerification }}</template>. Nessun cambiamento.
        </p>
      </div>

      <p class="lt-label mb-1.5">Impronta SHA-256 della chiave pubblica</p>
      <KeyFingerprint :hex="thumbprint" tone="light" />

      <label
        v-if="state === 'changed'"
        class="mt-3.5 flex cursor-pointer items-start gap-2.5 rounded-field border border-lilac-300 bg-white p-3 text-[0.86rem] leading-snug text-ink-700"
      >
        <input v-model="acknowledged" type="checkbox" class="mt-0.5 h-4 w-4 flex-none accent-[var(--color-brand-500)]" />
        Ho verificato con {{ email }} per un'altra via che questa è davvero la sua nuova chiave.
      </label>

      <div class="mt-3.5 flex gap-2">
        <button type="button" class="lt-btn-ghost flex-none" @click="emit('cancel')">Annulla</button>
        <button type="button" class="lt-btn flex-1" :disabled="!canProceed" @click="confirm">
          {{ state === 'changed' ? 'Procedi comunque' : 'Conferma e condividi' }}
        </button>
      </div>

      <p v-if="state === 'new'" class="mt-2.5 text-center text-[0.76rem] text-ink-400">
        Puoi anche procedere senza verificare: il file resta cifrato, ma non avrai la certezza di chi lo apre.
      </p>
    </div>
  </Dialog>
</template>
