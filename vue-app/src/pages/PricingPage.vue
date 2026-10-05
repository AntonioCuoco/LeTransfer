<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import { usePageEnter } from '@/src/composables/useMotion'
import {
  PLAN_CATALOG,
  PLAN_ORDER,
  GUEST_LIMITS,
  formatBytes,
  formatRetention,
  type PlanCatalogEntry,
  type PlanId,
} from '@/src/types/plan'
import { REGISTRATION_OPEN, REGISTRATION_CLOSED_MESSAGE } from '@/src/utils/registration'

/**
 * Prezzi (roadmap F3).
 *
 * I piani NON sono più descritti qui: vengono da [types/plan.ts](../types/plan.ts), lo
 * stesso catalogo che alimenta il pannello abbonamento, i prompt di upgrade e il limite
 * scritto in dashboard. Prima i limiti erano copiati a mano in questa pagina — cioè un
 * secondo posto da ricordare di aggiornare, su numeri che l'utente usa per decidere se
 * pagare. Ora c'è un file solo, ed è quello che dichiara di specchiare le env del backend.
 *
 * Posizione: la crittografia sta in tutti i piani, anche in quello gratuito. È il
 * contrario del pattern "sicurezza come upsell" — ed è l'unica cosa da dire forte.
 */

const router = useRouter()

const yearly = ref(false)
const { root: head } = usePageEnter()

// Le CTA sono l'unica cosa specifica di questa pagina: il catalogo descrive i piani,
// non cosa deve succedere quando ci clicchi sopra da qui.
const CTA: Record<PlanId, string> = {
  free: 'Crea un account gratis',
  pro: 'Passa a Pro',
  business: 'Parliamone',
}

const plans = computed(() => PLAN_ORDER.map((id) => PLAN_CATALOG[id]))

// Annuale: il prezzo vero sta nel catalogo (`yearlyEur`, Pro €90 = 12 mesi al prezzo di 10).
// Il prezzo mostrato resta sempre "al mese", per confrontarlo col mensile.
function priceOf(plan: PlanCatalogEntry): number {
  if (!plan.monthlyEur) return 0
  return yearly.value && plan.yearlyEur ? plan.yearlyEur / 12 : plan.monthlyEur
}

const faq = [
  {
    q: 'Se smetto di pagare, perdo i file?',
    a: 'I link già creati arrivano alla loro scadenza naturale. Poi il piano torna a Free, con i limiti di Free. Non cancelliamo niente prima del tempo che ti avevamo promesso.',
  },
  {
    q: 'Potete recuperare un file se perdo il link?',
    a: 'No. Non è una politica commerciale, è una conseguenza tecnica: la chiave era nel link e noi non l’abbiamo mai avuta. Se questo ti sembra un difetto, stai cercando un altro prodotto.',
  },
  {
    q: 'La cifratura è più forte nei piani a pagamento?',
    a: 'No. È identica in tutti e tre, incluso il piano gratuito e l’invio senza account. Pagando compri capienza e strumenti di gestione, non sicurezza.',
  },
]
</script>

<template>
  <PublicShell>
    <div ref="head" class="mx-auto w-full max-w-[1080px] py-[clamp(40px,8vh,96px)]">
      <p data-enter class="mb-[22px] font-mono text-[0.74rem] uppercase tracking-[0.32em] text-[#37e7c4]">Prezzi</p>
      <h1 data-enter class="mb-6 max-w-[16ch] text-balance font-display text-[clamp(2.6rem,7vw,5rem)] leading-[0.98] tracking-[-0.04em] [font-weight:840]">
        La crittografia non è un extra.
      </h1>
      <p data-enter class="max-w-[56ch] text-[clamp(1.05rem,1.6vw,1.24rem)] leading-relaxed text-[#b9ace2]">
        È identica in tutti i piani, compreso quello gratuito. Quello che cambia sono i gigabyte e il tempo.
      </p>

      <!-- Interruttore mensile/annuale -->
      <div class="mt-9 inline-flex items-center gap-1 rounded-[13px] border border-white/10 bg-white/[0.04] p-1">
        <button
          type="button"
          class="rounded-[10px] px-4 py-2 font-mono text-[0.74rem] tracking-[0.04em] transition-colors"
          :class="!yearly ? 'bg-white text-[#1b1140]' : 'text-[#b9ace2] hover:text-[#F2ECFF]'"
          @click="yearly = false"
        >
          mensile
        </button>
        <button
          type="button"
          class="rounded-[10px] px-4 py-2 font-mono text-[0.74rem] tracking-[0.04em] transition-colors"
          :class="yearly ? 'bg-white text-[#1b1140]' : 'text-[#b9ace2] hover:text-[#F2ECFF]'"
          @click="yearly = true"
        >
          annuale <span :class="yearly ? 'text-[#12b89a]' : 'text-[#37e7c4]'">−2 mesi</span>
        </button>
      </div>

      <!-- Piani -->
      <div v-reveal="{ stagger: 0.07 }" class="mt-8 grid gap-4 md:grid-cols-3">
        <div
          v-for="plan in plans"
          :key="plan.id"
          class="flex flex-col rounded-[20px] p-6"
          :class="plan.featured
            ? 'bg-[#FBFAFF] text-[#1b1140] shadow-[0_40px_90px_-30px_rgba(8,2,24,0.7),inset_0_2px_0_rgba(255,255,255,0.5)]'
            : 'border border-white/10 bg-white/[0.03]'"
        >
          <div class="flex items-baseline justify-between">
            <h2 class="text-[1.3rem] font-bold tracking-[-0.02em]">{{ plan.name }}</h2>
            <span v-if="plan.featured" class="rounded-full bg-[#724cf9] px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-white">
              consigliato
            </span>
          </div>
          <p class="mt-1.5 text-[0.88rem] leading-snug" :class="plan.featured ? 'text-[#6a5f8c]' : 'text-[#b9ace2]'">
            {{ plan.tagline }}
          </p>

          <div class="mt-6 flex items-baseline gap-1.5">
            <span class="text-[2.6rem] font-bold leading-none tracking-[-0.04em]">
              {{ priceOf(plan) === 0 ? '€0' : `€${priceOf(plan).toFixed(2).replace('.', ',')}` }}
            </span>
            <span class="font-mono text-[0.72rem]" :class="plan.featured ? 'text-[#6a5f8c]' : 'text-[#8d7fb8]'">
              /mese{{ plan.id === 'business' ? ' · utente' : '' }}
            </span>
          </div>
          <p
            v-if="yearly && plan.yearlyEur"
            class="mt-1.5 font-mono text-[0.7rem]"
            :class="plan.featured ? 'text-[#6a5f8c]' : 'text-[#8d7fb8]'"
          >
            €{{ plan.yearlyEur }} in un'unica soluzione all'anno
          </p>

          <!-- I due numeri che contano davvero, in mono e ben visibili -->
          <dl
            class="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-[12px] p-3.5 font-mono text-[0.72rem]"
            :class="plan.featured ? 'bg-[#f5f1fd]' : 'border border-white/10 bg-white/[0.03]'"
          >
            <dt :class="plan.featured ? 'text-[#6a5f8c]' : 'text-[#8d7fb8]'">file max</dt>
            <dd class="text-right font-bold" :class="plan.featured ? 'text-[#1b1140]' : 'text-[#F2ECFF]'">{{ formatBytes(plan.limits.maxFileBytes) }}</dd>
            <dt :class="plan.featured ? 'text-[#6a5f8c]' : 'text-[#8d7fb8]'">invii al mese</dt>
            <dd class="text-right font-bold" :class="plan.featured ? 'text-[#1b1140]' : 'text-[#F2ECFF]'">{{ formatBytes(plan.limits.maxMonthlyBytes) }}</dd>
            <dt :class="plan.featured ? 'text-[#6a5f8c]' : 'text-[#8d7fb8]'">spazio</dt>
            <dd class="text-right font-bold" :class="plan.featured ? 'text-[#1b1140]' : 'text-[#F2ECFF]'">{{ formatBytes(plan.limits.maxStoredBytes) }}</dd>
            <dt :class="plan.featured ? 'text-[#6a5f8c]' : 'text-[#8d7fb8]'">i link durano</dt>
            <dd class="text-right font-bold" :class="plan.featured ? 'text-[#1b1140]' : 'text-[#F2ECFF]'">{{ formatRetention(plan.limits.maxExpiryHours) }}</dd>
            <dt :class="plan.featured ? 'text-[#6a5f8c]' : 'text-[#8d7fb8]'">i file restano</dt>
            <dd class="text-right font-bold" :class="plan.featured ? 'text-[#1b1140]' : 'text-[#F2ECFF]'">{{ plan.fileRetention }}</dd>
            <dt :class="plan.featured ? 'text-[#6a5f8c]' : 'text-[#8d7fb8]'">cifratura</dt>
            <dd class="text-right font-bold text-[#12b89a]">AES-256</dd>
          </dl>

          <ul class="mt-5 flex flex-1 flex-col gap-2 text-[0.86rem]">
            <li v-for="feature in plan.features" :key="feature" class="flex items-baseline gap-2.5">
              <span :class="plan.featured ? 'text-[#12b89a]' : 'text-[#37e7c4]'">✓</span>
              <span :class="plan.featured ? 'text-[#3d3260]' : 'text-[#b9ace2]'">{{ feature }}</span>
            </li>
          </ul>

          <button
            type="button"
            class="mt-6 w-full rounded-[13px] p-3.5 text-[0.95rem] font-bold tracking-[-0.01em] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            :class="plan.featured
              ? 'bg-[linear-gradient(140deg,#724cf9,#5a30eb)] text-white shadow-[0_14px_30px_-12px_rgba(90,48,235,0.85)] hover:brightness-105'
              : 'border border-white/15 bg-white/[0.06] text-[#F2ECFF] hover:border-white/30'"
            :disabled="!REGISTRATION_OPEN"
            :title="!REGISTRATION_OPEN ? REGISTRATION_CLOSED_MESSAGE : undefined"
            @click="router.push('/register')"
          >
            {{ CTA[plan.id] }}
          </button>
        </div>
      </div>

      <!-- La porta d'ingresso della scala ospite → Free → Pro (2026-10-05): chi vuole solo mandare
           un file al volo non deve pensare che serva un account. -->
      <p class="mt-5 text-[0.92rem] text-[#b9ace2]" data-testid="guest-entry">
        Vuoi solo mandare un file al volo?
        <button type="button" class="font-semibold text-[#F2ECFF] underline decoration-[#724cf9] underline-offset-4 hover:decoration-2" @click="router.push('/')">
          Fino a {{ GUEST_LIMITS.maxTransferLabel }} anche senza account →
        </button>
      </p>

      <p class="mt-4 font-mono text-[0.7rem] text-[#8d7fb8]">
        Prezzi IVA esclusa. I limiti sono quelli applicati davvero dal server, non promesse di brochure.
      </p>

      <!-- Domande scomode -->
      <section class="mt-[clamp(48px,7vh,84px)]">
        <h2 class="mb-7 text-[clamp(1.5rem,3vw,2.2rem)] font-bold tracking-[-0.03em]">Le domande scomode</h2>
        <dl class="border-t border-white/10">
          <div v-for="item in faq" :key="item.q" class="grid gap-x-8 gap-y-2 border-b border-white/10 py-6 md:grid-cols-[minmax(0,320px)_1fr]">
            <dt class="text-[1.05rem] font-bold tracking-[-0.01em]">{{ item.q }}</dt>
            <dd class="max-w-[58ch] leading-relaxed text-[#b9ace2]">{{ item.a }}</dd>
          </div>
        </dl>
      </section>
    </div>
  </PublicShell>
</template>
