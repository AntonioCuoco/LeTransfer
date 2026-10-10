<script setup lang="ts">
/**
 * Feedback e aiuto nell'area autenticata (/app/feedback): si sa chi scrive, niente captcha.
 */
import { computed } from 'vue'
import FeedbackForm from '@/src/components/FeedbackForm.vue'
import { getCurrentUser } from '@/src/utils/getCurrentUser'

const email = computed(() => getCurrentUser()?.email ?? null)
</script>

<template>
  <div class="mx-auto flex w-full max-w-[860px] flex-col">
    <header class="mb-6">
      <h1 class="m-0 text-[clamp(1.5rem,3vw,2rem)] font-bold tracking-[-0.03em] text-haze-100">Feedback e aiuto</h1>
      <p class="m-0 mt-1.5 max-w-[68ch] text-sm leading-relaxed text-haze-400">
        Un'idea, qualcosa che non va, una domanda: scrivici. Ogni messaggio viene letto da una persona,
        e i tuoi feedback aiutano Novren a crescere nella direzione giusta.
      </p>
    </header>
    <section class="rounded-card border border-white/10 bg-white/[0.03] p-[clamp(18px,3vw,28px)]">
      <FeedbackForm source="web" :authenticated="true" :account-email="email" />
    </section>
  </div>
</template>
