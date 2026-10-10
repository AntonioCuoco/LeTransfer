<script setup lang="ts">
/**
 * Feedback e aiuto, pagina pubblica (/feedback): chiunque, anche senza account.
 */
import PublicShell from '@/src/components/landing/PublicShell.vue'
import FeedbackForm from '@/src/components/FeedbackForm.vue'
</script>

<template>
  <PublicShell>
    <div class="mx-auto grid w-full max-w-[1100px] gap-10 py-[clamp(30px,6vh,80px)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      <div>
        <p class="mb-4 font-mono text-[0.74rem] uppercase tracking-[0.32em] text-[#37e7c4]">Feedback e aiuto</p>
        <h1 class="mb-5 text-balance font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[1] tracking-[-0.035em] [font-weight:800]">
          Dicci cosa ne pensi.
        </h1>
        <p class="max-w-[46ch] text-[1.05rem] leading-relaxed text-[#b9ace2]">
          Un'idea, qualcosa che non va, una domanda: scrivici. <strong class="text-[#F2ECFF]">Ogni messaggio viene letto</strong>
          da una persona, e i vostri feedback decidono la rotta di Novren: cosa costruire, cosa sistemare prima.
        </p>
        <p class="mt-6 max-w-[46ch] text-sm leading-relaxed text-[#8d7fb8]">
          Preferisci l'email? <a href="mailto:info@novren.net" class="font-mono text-[#b9ace2] hover:text-[#F2ECFF]">info@novren.net</a>.
          Per problemi di sicurezza: <a href="mailto:security@novren.net" class="font-mono text-[#b9ace2] hover:text-[#F2ECFF]">security@novren.net</a>.
        </p>
      </div>
      <div class="rounded-[28px] border border-white/10 bg-white/[0.03] p-[clamp(20px,3vw,32px)]">
        <FeedbackForm source="landing" :authenticated="false" />
      </div>
    </div>
  </PublicShell>
</template>
