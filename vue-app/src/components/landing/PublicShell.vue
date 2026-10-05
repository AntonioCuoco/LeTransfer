<script setup lang="ts">
import { ref } from 'vue'
import '@/src/assets/landing.css'
import BrandSeal from './BrandSeal.vue'
import novrenIcon from '@/src/assets/novren-icon.png'
import CipherField from './CipherField.vue'
import GuestTransferPill from './GuestTransferPill.vue'
import { useRoute, useRouter } from 'vue-router'
import { REGISTRATION_OPEN, REGISTRATION_CLOSED_MESSAGE } from '@/src/utils/registration'

/**
 * Guscio delle superfici pubbliche (invio e ricezione): il "mondo viola" della landing.
 * Fondo radiale + campo generativo di ciphertext + grana/vignetta, header bianco sticky
 * e il climax del sigillo. Sta qui, non duplicato nelle pagine, perché chi invia e chi
 * riceve devono vedere lo stesso oggetto: è l'identità del prodotto, non decorazione.
 *
 * Il genitore pilota il fondo con surge()/settle()/calm() e stampa il sigillo con stampSeal().
 */

withDefaults(defineProps<{ showNav?: boolean }>(), { showNav: true })

const router = useRouter()
const route = useRoute()

const NAV = [
  { to: '/come-funziona', label: 'Come funziona' },
  { to: '/prezzi', label: 'Prezzi' },
  { to: '/sicurezza', label: 'Sicurezza' },
]

const cipherField = ref<InstanceType<typeof CipherField> | null>(null)
const sealFlashEl = ref<HTMLElement | null>(null)
const sealStampEl = ref<HTMLElement | null>(null)

// Riavvia un'animazione CSS forzando un reflow (togli → reflow → rimetti la classe).
function replayAnimation(element: HTMLElement | null) {
  if (!element) return
  element.classList.remove('fire')
  void element.offsetWidth
  element.classList.add('fire')
}

function surge() {
  cipherField.value?.surge()
}

function settle() {
  cipherField.value?.settle()
}

function calm() {
  cipherField.value?.calm()
}

function stampSeal() {
  replayAnimation(sealFlashEl.value)
  replayAnimation(sealStampEl.value)
}

defineExpose({ surge, settle, calm, stampSeal })
</script>

<template>
  <div class="ltx-root bg-[#1f0d49] text-[#F2ECFF] antialiased">
    <!-- Sta nel guscio, non nella facciata: l'invio continua mentre leggi
         "come funziona" o ti registri, e deve poterlo dire su qualsiasi pagina pubblica. -->
    <GuestTransferPill />
    <section class="ltx-hero relative isolate flex min-h-dvh flex-col">
      <CipherField ref="cipherField" />
      <div class="ltx-grain" aria-hidden="true" />
      <div class="ltx-vignette" aria-hidden="true" />
      <div ref="sealFlashEl" class="ltx-sealflash" aria-hidden="true" />
      <div ref="sealStampEl" class="ltx-sealstamp" aria-hidden="true">
        <BrandSeal variant="check" check-color="#ffffff" class="h-full w-full" />
      </div>

      <!-- Header bianco stile WeTransfer, sticky -->
      <header class="sticky top-0 z-20 border-b border-black/5 bg-white shadow-[0_8px_24px_-16px_rgba(20,9,58,0.35)]">
        <div class="flex items-center justify-between px-[clamp(20px,5vw,64px)] py-3">
          <!-- Logo -->
          <a
            href="/"
            class="flex items-center gap-2.5 text-[1.12rem] font-extrabold tracking-[-0.02em] text-[#1b1140]"
            @click.prevent="router.push('/')"
          >
            <img :src="novrenIcon" alt="Novren" width="54" height="28" />
            Novren
          </a>

          <!-- Nav + azioni -->
          <div class="flex items-center gap-1">
            <nav v-if="showNav" class="mr-1 hidden items-center gap-0.5 md:flex">
              <RouterLink
                v-for="item in NAV"
                :key="item.to"
                :to="item.to"
                class="rounded-[10px] px-3.5 py-2 text-[0.9rem] transition-colors hover:text-[#1b1140]"
                :class="route.path === item.to ? 'font-semibold text-[#1b1140]' : 'font-medium text-[#4a4368]'"
              >
                {{ item.label }}
              </RouterLink>
            </nav>
            <span v-if="showNav" class="mx-2 hidden h-5 w-px bg-black/10 md:block" />
            <RouterLink
              v-if="route.path !== '/login'"
              to="/login"
              class="rounded-[11px] px-3.5 py-2 text-[0.9rem] font-semibold text-[#1b1140] transition-colors hover:text-[#724cf9]"
            >
              Accedi
            </RouterLink>
            <RouterLink
              v-if="REGISTRATION_OPEN && route.path !== '/register'"
              to="/register"
              class="rounded-[11px] bg-[#724cf9] px-4 py-2 text-[0.9rem] font-bold text-white shadow-[0_8px_20px_-8px_rgba(114,76,249,0.6)] transition hover:brightness-105"
            >
              Registrati
            </RouterLink>
            <!-- Registrazione chiusa: il pulsante resta al suo posto ma è inerte, e il
                 tooltip dice perché. Toglierlo farebbe sembrare l'app senza account. -->
            <span
              v-else-if="!REGISTRATION_OPEN"
              :title="REGISTRATION_CLOSED_MESSAGE"
              aria-disabled="true"
              data-testid="register-disabled"
              class="cursor-not-allowed rounded-[11px] bg-[#724cf9]/40 px-4 py-2 text-[0.9rem] font-bold text-white/70"
            >
              Registrati
            </span>
          </div>
        </div>
      </header>

      <!-- Contenuto -->
      <div class="relative z-[2] flex flex-1 flex-col px-[clamp(20px,5vw,64px)]">
        <slot />
      </div>

      <slot name="footer" />
    </section>

    <!-- Footer del sito: sotto la piega, così l'hero resta esattamente un viewport -->
    <footer class="relative z-[2] border-t border-white/10 bg-[#160934] px-[clamp(20px,5vw,64px)] py-10">
      <div v-reveal="{ stagger: 0.05 }" class="flex flex-wrap items-start justify-between gap-x-12 gap-y-8">
        <div class="max-w-[300px]">
          <div class="mb-3 flex items-center gap-2.5 text-[1.05rem] font-extrabold tracking-[-0.02em]">
            <img :src="novrenIcon" alt="Novren" width="46" height="24" />
            Novren
          </div>
          <p class="text-[0.86rem] leading-relaxed text-[#8d7fb8]">
            Trasferimenti cifrati nel browser. La chiave non passa mai dai nostri server — per scelta,
            e per costruzione.
          </p>
        </div>

        <nav class="grid gap-2.5">
          <span class="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-[#6a5f8c]">Prodotto</span>
          <RouterLink v-for="item in NAV" :key="item.to" :to="item.to" class="text-[0.88rem] text-[#b9ace2] transition-colors hover:text-[#F2ECFF]">
            {{ item.label }}
          </RouterLink>
        </nav>

        <nav class="grid gap-2.5">
          <span class="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-[#6a5f8c]">Account</span>
          <RouterLink to="/login" class="text-[0.88rem] text-[#b9ace2] transition-colors hover:text-[#F2ECFF]">Accedi</RouterLink>
          <RouterLink v-if="REGISTRATION_OPEN" to="/register" class="text-[0.88rem] text-[#b9ace2] transition-colors hover:text-[#F2ECFF]">Crea un account</RouterLink>
          <span v-else :title="REGISTRATION_CLOSED_MESSAGE" aria-disabled="true" class="cursor-not-allowed text-[0.88rem] text-[#6a5f8c]">Crea un account</span>
        </nav>

        <div class="grid gap-2.5">
          <span class="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-[#6a5f8c]">Segnalazioni</span>
          <a href="mailto:security@novren.net" class="font-mono text-[0.82rem] text-[#b9ace2] transition-colors hover:text-[#F2ECFF]">
            security@novren.net
          </a>
          <span class="mt-2 font-mono text-[0.64rem] uppercase tracking-[0.18em] text-[#6a5f8c]">Contattami</span>
          <a href="mailto:info@novren.net" class="font-mono text-[0.82rem] text-[#b9ace2] transition-colors hover:text-[#F2ECFF]">
            info@novren.net
          </a>
        </div>
      </div>

      <div class="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5 font-mono text-[0.7rem] text-[#6a5f8c]">
        <span>© {{ new Date().getFullYear() }} Novren</span>
        <span>Dati in UE · cifratura end-to-end · nessun log dei contenuti</span>
      </div>
    </footer>
  </div>
</template>
