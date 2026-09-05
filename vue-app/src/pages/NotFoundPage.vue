<script setup lang="ts">
import PublicShell from '@/src/components/landing/PublicShell.vue'
import { useRouter } from 'vue-router'
import { usePageEnter } from '@/src/composables/useMotion'

const router = useRouter()
const { root: head } = usePageEnter()
</script>

<template>
  <PublicShell>
    <div ref="head" class="flex flex-1 flex-col items-center justify-center py-24 text-center">
      <span class="font-mono text-[0.72rem] uppercase tracking-[0.22em] text-[#b9ace2]">Errore 404</span>
      <h1 class="mt-3 text-[clamp(2.2rem,6vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.02em]">
        Questa pagina non esiste
      </h1>
      <p class="mt-4 max-w-[480px] text-[1rem] leading-relaxed text-[#c9beea]">
        Il link potrebbe essere scaduto, scritto male o non essere mai esistito. Il file che cerchi non è qui.
      </p>
      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          class="rounded-[11px] bg-[#724cf9] px-5 py-2.5 text-[0.92rem] font-bold text-white shadow-[0_8px_20px_-8px_rgba(114,76,249,0.6)] transition hover:brightness-105"
          @click="router.push('/')"
        >
          Torna alla home
        </button>
        <button
          type="button"
          class="rounded-[11px] border border-white/15 px-5 py-2.5 text-[0.92rem] font-semibold text-[#F2ECFF] transition hover:bg-white/5"
          @click="router.back()"
        >
          Indietro
        </button>
      </div>
    </div>
  </PublicShell>
</template>
