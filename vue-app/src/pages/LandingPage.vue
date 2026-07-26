<script setup lang="ts">
import { ref } from 'vue'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import GuestSendWidget from '@/src/components/landing/GuestSendWidget.vue'

/**
 * Landing pubblica — facciata "invio senza account" (direzione approvata).
 * Mondo viola pieno + campo generativo di ciphertext (WeTransfer DNA), widget
 * d'invio umile, firma viola→menta (Proton), climax del "sigillo".
 * Il guscio (fondo, header, sigillo) è in PublicShell, condiviso con la ricezione.
 * Riferimento visivo e piano: docs/FRONTEND_WORKORDER_ROADMAP.md (F1).
 */

const shell = ref<InstanceType<typeof PublicShell> | null>(null)

function onEncryptStart() {
  shell.value?.surge()
}

function onEncryptDone() {
  shell.value?.settle()
  shell.value?.stampSeal()
}

function onReset() {
  shell.value?.calm()
}
</script>

<template>
  <PublicShell ref="shell">
    <!-- Hero: copy + widget d'invio. Larghezza piena (stessi margini dell'header). -->
    <div class="grid w-full flex-1 content-center gap-8 py-[clamp(26px,5vh,70px)] lg:grid-cols-[1.1fr_minmax(0,440px)] lg:items-center lg:gap-[60px]">
      <div class="max-w-[600px]">
        <p class="mb-[22px] font-mono text-[0.74rem] uppercase tracking-[0.32em] text-[#37e7c4]">
          Invio cifrato · senza account
        </p>
        <h1 class="mb-5 text-balance text-[clamp(2.9rem,8vw,6.2rem)] leading-[0.96] tracking-[-0.04em] [font-weight:840]">
          Impossibile<br />da leggere.<br /><em class="not-italic text-[#37e7c4]">Anche per noi.</em>
        </h1>
        <p class="max-w-[46ch] text-[clamp(1.05rem,1.6vw,1.28rem)] leading-relaxed text-[#b9ace2]">
          Trascina un file, ottieni un link. Cifrato end-to-end nel tuo browser — la chiave resta nel link e il nostro server vede soltanto ciphertext.
        </p>
      </div>

      <GuestSendWidget
        class="lg:justify-self-end"
        @start="onEncryptStart"
        @done="onEncryptDone"
        @reset="onReset"
      />
    </div>

    <!-- Striscia di fiducia -->
    <template #footer>
      <div class="relative z-[2] border-t border-white/10 px-[clamp(20px,5vw,64px)] py-4">
        <div class="flex flex-wrap items-center gap-x-10 gap-y-2">
          <span class="font-mono text-[0.66rem] uppercase tracking-[0.18em] text-[#37e7c4]">Perché noi</span>
          <span class="font-mono text-[0.74rem] tracking-[0.04em] text-[#b9ace2]">Zero-knowledge verificabile</span>
          <span class="font-mono text-[0.74rem] tracking-[0.04em] text-[#b9ace2]">Post-quantum ready</span>
          <span class="font-mono text-[0.74rem] tracking-[0.04em] text-[#b9ace2]">Dati in UE · nessun log dei contenuti</span>
          <span class="font-mono text-[0.74rem] tracking-[0.04em] text-[#b9ace2]">Open-source</span>
        </div>
      </div>
    </template>
  </PublicShell>
</template>
