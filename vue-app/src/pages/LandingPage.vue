<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import GuestSendWidget from '@/src/components/landing/GuestSendWidget.vue'
import { usePageEnter } from '@/src/composables/useMotion'
import { useGuestUploadStore } from '@/src/stores/guestUpload'

/**
 * Landing pubblica — facciata "invio senza account" (direzione approvata).
 * Mondo viola pieno + campo generativo di ciphertext (WeTransfer DNA), widget
 * d'invio umile, firma viola→menta (Proton), climax del "sigillo".
 * Il guscio (fondo, header, sigillo) è in PublicShell, condiviso con la ricezione.
 * Riferimento visivo e piano: docs/FRONTEND_WORKORDER_ROADMAP.md (F1).
 */

const shell = ref<InstanceType<typeof PublicShell> | null>(null)

// Entrata orchestrata dell'hero (F0.2): occhiello → titolo → sottotitolo → widget.
// Il widget arriva per ultimo di proposito: prima si legge la promessa, poi appare
// la cosa da usare.
const { root: hero } = usePageEnter()

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

// Si può tornare qui a invio già avviato (o già finito): il fondo deve raccontare
// lo stato vero, non ripartire da fermo solo perché il componente è nuovo.
const guestUpload = useGuestUploadStore()
onMounted(() => {
  if (guestUpload.isBusy) shell.value?.surge()
  else if (guestUpload.status === 'done') shell.value?.settle()
})
</script>

<template>
  <PublicShell ref="shell">
    <!-- Hero: copy + widget d'invio. Larghezza piena (stessi margini dell'header). -->
    <div ref="hero" class="grid w-full flex-1 content-center gap-8 py-[clamp(26px,5vh,70px)] lg:grid-cols-[1.1fr_minmax(0,440px)] lg:items-center lg:gap-[60px]">
      <div class="max-w-[600px]">
        <p data-enter class="mb-[22px] font-mono text-[0.74rem] uppercase tracking-[0.32em] text-[#37e7c4]">
          Invio cifrato · senza account
        </p>
        <h1 data-enter class="mb-5 text-balance font-display text-[clamp(2.9rem,8vw,6.2rem)] leading-[0.96] tracking-[-0.04em] [font-weight:840]">
          Impossibile<br />da leggere.<br /><em class="not-italic text-[#37e7c4]">Anche per noi.</em>
        </h1>
        <p data-enter class="max-w-[46ch] text-[clamp(1.05rem,1.6vw,1.28rem)] leading-relaxed text-[#b9ace2]">
          Trascina un file, ottieni un link. Cifrato end-to-end nel tuo browser — la chiave resta nel link e il nostro server vede soltanto ciphertext.
        </p>
      </div>

      <GuestSendWidget
        data-enter
        class="lg:justify-self-end"
        @start="onEncryptStart"
        @done="onEncryptDone"
        @reset="onReset"
      />
    </div>

    <!-- Feedback: esplicito, non solo un indirizzo nel footer. -->
    <div class="mb-[clamp(18px,4vh,40px)] flex w-full flex-wrap items-center justify-between gap-4 rounded-[22px] border border-white/10 bg-white/[0.03] px-[clamp(18px,3vw,28px)] py-4">
      <p class="m-0 max-w-[70ch] text-[0.95rem] leading-relaxed text-[#b9ace2]">
        <strong class="text-[#F2ECFF]">Novren cresce con chi lo usa.</strong>
        Idee, problemi, domande: leggiamo ogni messaggio, e i vostri feedback decidono cosa costruiamo dopo.
      </p>
      <RouterLink to="/feedback" class="rounded-full border border-[#8b6bff]/60 px-5 py-2.5 text-sm font-semibold text-[#F2ECFF] transition-colors hover:bg-[#724cf9]/25">
        Lascia un feedback
      </RouterLink>
    </div>

    <!-- Striscia di fiducia -->
    <template #footer>
      <div class="relative z-[2] border-t border-white/10 px-[clamp(20px,5vw,64px)] py-4">
        <!-- Niente reveal qui: la striscia sta nell'ultima fascia del viewport dell'hero,
             dove il margine inferiore dell'osservatore non la considererebbe "entrata"
             finché non si scrolla — resterebbe invisibile pur essendo sullo schermo. -->
        <div class="flex flex-wrap items-center gap-x-10 gap-y-2">
          <span class="font-mono text-[0.66rem] uppercase tracking-[0.18em] text-[#37e7c4]">Perché noi</span>
          <span class="font-mono text-[0.74rem] tracking-[0.04em] text-[#b9ace2]">Zero-knowledge verificabile</span>
          <span class="font-mono text-[0.74rem] tracking-[0.04em] text-[#b9ace2]">AES-256 · cifrato nel browser</span>
          <span class="font-mono text-[0.74rem] tracking-[0.04em] text-[#b9ace2]">Dati in UE · nessun log dei contenuti</span>
          <RouterLink to="/sicurezza" class="font-mono text-[0.74rem] tracking-[0.04em] text-[#b9ace2] underline-offset-4 transition-colors hover:text-[#F2ECFF] hover:underline">
            Open-source · cosa non copriamo →
          </RouterLink>
        </div>
      </div>
    </template>
  </PublicShell>
</template>
