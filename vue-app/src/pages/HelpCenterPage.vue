<script setup lang="ts">
import { computed, ref } from 'vue'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import { usePageEnter } from '@/src/composables/useMotion'
import { HELP_CATEGORIES, articlesIn, searchArticles } from '@/src/content/help'

/**
 * Centro assistenza (`/aiuto`): problemi e soluzioni, a cosa servono le impostazioni, come usare
 * Novren al meglio. Gli articoli sono in `content/help.ts`; qui la ricerca e l'indice per categoria.
 */

const query = ref('')
const results = computed(() => searchArticles(query.value))
const searching = computed(() => query.value.trim().length > 0)

const sections = computed(() => HELP_CATEGORIES.map((category) => ({ ...category, articles: articlesIn(category.id) })))

const { root: head } = usePageEnter()
</script>

<template>
  <PublicShell>
    <div ref="head" class="mx-auto w-full max-w-[1040px] py-[clamp(40px,8vh,96px)]">
      <p data-enter class="mb-[22px] font-mono text-[0.74rem] uppercase tracking-[0.32em] text-[#37e7c4]">Centro assistenza</p>
      <h1 data-enter class="mb-6 max-w-[16ch] text-balance font-display text-[clamp(2.6rem,7vw,4.6rem)] leading-[0.98] tracking-[-0.04em] [font-weight:840]">
        Come possiamo aiutarti?
      </h1>
      <p data-enter class="max-w-[58ch] text-[clamp(1.05rem,1.6vw,1.2rem)] leading-relaxed text-[#b9ace2]">
        Problemi e soluzioni, a cosa serve ogni impostazione, e come usare Novren al meglio.
      </p>

      <!-- Ricerca: filtra mentre scrivi, senza mandare niente a nessuno -->
      <label data-enter class="mt-9 flex max-w-[640px] items-center gap-3 rounded-[18px] border border-white/15 bg-white/[0.06] px-5 py-4 focus-within:border-[#37e7c4]">
        <svg viewBox="0 0 24 24" class="h-5 w-5 flex-none text-[#b9ace2]" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" />
        </svg>
        <input
          v-model="query"
          type="search"
          class="w-full bg-transparent text-[1.05rem] text-[#F2ECFF] placeholder:text-[#8d7fb8] focus:outline-none"
          placeholder="Cerca: «link incompleto», «firewall», «24 parole»…"
          aria-label="Cerca negli articoli"
          data-test="help-search"
        />
      </label>

      <!-- Risultati della ricerca -->
      <section v-if="searching" class="mt-10" aria-live="polite">
        <p class="mb-4 font-mono text-[0.74rem] text-[#8d7fb8]">
          {{ results.length ? `${results.length} ${results.length === 1 ? 'articolo' : 'articoli'}` : 'Nessun articolo trovato' }}
        </p>
        <div class="grid gap-3">
          <RouterLink
            v-for="article in results"
            :key="article.slug"
            :to="`/aiuto/${article.slug}`"
            class="group rounded-[18px] border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-[#37e7c4]/60 hover:bg-white/[0.07]"
            data-test="help-result"
          >
            <span class="block text-[1.08rem] font-semibold group-hover:text-[#F2ECFF]">{{ article.title }}</span>
            <span class="mt-1 block text-[0.92rem] text-[#b9ace2]">{{ article.summary }}</span>
          </RouterLink>
        </div>
        <p v-if="!results.length" class="mt-4 text-[0.95rem] text-[#b9ace2]">
          Prova con altre parole, oppure <RouterLink to="/feedback" class="text-[#37e7c4] underline underline-offset-4">scrivici</RouterLink>: rispondiamo noi.
        </p>
      </section>

      <!-- Indice per categoria -->
      <div v-else class="mt-[clamp(40px,6vh,72px)] grid gap-5 md:grid-cols-2">
        <section
          v-for="section in sections"
          :key="section.id"
          v-reveal
          class="rounded-[22px] border border-white/10 bg-white/[0.04] p-6"
        >
          <h2 class="text-[1.3rem] font-bold tracking-[-0.02em]">{{ section.title }}</h2>
          <p class="mb-4 mt-1 font-mono text-[0.74rem] text-[#8d7fb8]">{{ section.blurb }}</p>
          <ul class="grid gap-1">
            <li v-for="article in section.articles" :key="article.slug">
              <RouterLink
                :to="`/aiuto/${article.slug}`"
                class="flex items-baseline justify-between gap-3 rounded-[10px] px-2 py-2 text-[0.98rem] text-[#e6defb] transition-colors hover:bg-white/[0.06] hover:text-[#F2ECFF]"
              >
                <span>{{ article.title }}</span>
                <span aria-hidden="true" class="text-[#37e7c4]">→</span>
              </RouterLink>
            </li>
          </ul>
        </section>
      </div>

      <section v-reveal class="mt-[clamp(48px,7vh,84px)] flex flex-wrap items-center justify-between gap-5 rounded-[22px] border border-[#37e7c4]/30 bg-[#37e7c4]/[0.06] p-6">
        <div>
          <h2 class="text-[1.2rem] font-bold">Non trovi la risposta?</h2>
          <p class="mt-1 text-[0.95rem] text-[#b9ace2]">Scrivici: ogni messaggio lo legge una persona.</p>
        </div>
        <RouterLink to="/feedback" class="rounded-[14px] bg-[#37e7c4] px-5 py-3 font-semibold text-[#160934] transition-transform hover:-translate-y-0.5">Scrivici</RouterLink>
      </section>
    </div>
  </PublicShell>
</template>
