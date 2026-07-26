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
        <p class="mb-[22px] font-mono text-[0.74rem] uppercase tracking-[0.32em] text-[#b9ace2]">
          {{ config.eyebrow }}
        </p>
        <h1 class="mb-5 text-balance text-[clamp(2.4rem,6vw,4.4rem)] leading-[1] tracking-[-0.04em] [font-weight:840]">
          {{ config.title }}
        </h1>
        <p class="max-w-[46ch] text-[clamp(1rem,1.5vw,1.18rem)] leading-relaxed text-[#b9ace2]">
          {{ message || config.description }}
        </p>
      </div>

      <div class="w-[min(430px,100%)] rounded-[22px] bg-[#FBFAFF] p-5 text-[#1b1140] shadow-[0_40px_90px_-30px_rgba(8,2,24,0.7),inset_0_2px_0_rgba(255,255,255,0.5)] lg:justify-self-end">
        <p class="mb-1 text-[1.04rem] font-bold tracking-[-0.01em]">Puoi mandarne uno tu.</p>
        <p class="mb-4 text-[0.86rem] leading-snug text-[#6a5f8c]">
          Trascina un file, ottieni un link cifrato nel browser. Senza account.
        </p>
        <button
          type="button"
          class="w-full rounded-[13px] bg-[linear-gradient(140deg,#724cf9,#5a30eb)] p-3.5 text-base font-bold tracking-[-0.01em] text-white shadow-[0_14px_30px_-12px_rgba(90,48,235,0.85)] transition hover:-translate-y-px hover:brightness-105"
          @click="router.push('/')"
        >
          Invia un file
        </button>
      </div>
    </div>
  </PublicShell>
</template>
