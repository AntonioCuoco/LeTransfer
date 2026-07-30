<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import type { LinkStatus } from '@/src/composables/usePublicLink'

/**
 * Link non apribile (scaduto, revocato, limite raggiunto, inesistente).
 * Resta dentro il mondo pubblico: un link morto è comunque una prima impressione,
 * e per un prodotto sulla privacy la scadenza è una feature, non un errore da nascondere.
 */

const props = defineProps<{ status: LinkStatus; message?: string }>()

const router = useRouter()

const CONFIG: Record<string, { eyebrow: string; title: string; description: string }> = {
  not_found: {
    eyebrow: 'Link inesistente',
    title: 'Qui non c’è niente.',
    description: 'Il link non esiste, oppure è stato copiato a metà. Chiedi a chi te l’ha mandato di rifarlo.',
  },
  expired: {
    eyebrow: 'Link scaduto',
    title: 'È scaduto, come doveva.',
    description: 'Ogni trasferimento ha una data di morte: passata quella, i byte cifrati vengono cancellati. Chiedi un link nuovo.',
  },
  revoked: {
    eyebrow: 'Link revocato',
    title: 'Chi l’ha inviato l’ha ritirato.',
    description: 'Il link è stato revocato dal mittente e non apre più nulla.',
  },
  download_limit: {
    eyebrow: 'Limite raggiunto',
    title: 'Questo link era a numero chiuso.',
    description: 'Ha raggiunto il numero massimo di download consentiti dal mittente.',
  },
  error: {
    eyebrow: 'Errore',
    title: 'Non riusciamo ad aprirlo.',
    description: 'Qualcosa è andato storto nel recupero del link. Riprova tra poco.',
  },
}

const config = computed(() => CONFIG[props.status] || CONFIG.error)
</script>

<template>
  <PublicShell :show-nav="false">
    <div class="grid w-full flex-1 content-center gap-8 py-[clamp(26px,5vh,70px)] lg:grid-cols-[1.05fr_minmax(0,430px)] lg:items-center lg:gap-[60px]">
      <div class="max-w-[600px]">
        <p class="lt-eyebrow mb-[22px] text-haze-300">
          {{ config.eyebrow }}
        </p>
        <h1 class="lt-display mb-5">
          {{ config.title }}
        </h1>
        <p class="max-w-[46ch] text-[clamp(1rem,1.5vw,1.18rem)] leading-relaxed text-haze-300">
          {{ message || config.description }}
        </p>
      </div>

      <div class="lt-card w-[min(430px,100%)] p-5 lg:justify-self-end">
        <p class="mb-1 text-[1.04rem] font-bold tracking-[-0.01em]">Puoi mandarne uno tu.</p>
        <p class="mb-4 text-[0.86rem] leading-snug text-ink-500">
          Trascina un file, ottieni un link cifrato nel browser. Senza account.
        </p>
        <button type="button" class="lt-btn" @click="router.push('/')">
          Invia un file
        </button>
      </div>
    </div>
  </PublicShell>
</template>
