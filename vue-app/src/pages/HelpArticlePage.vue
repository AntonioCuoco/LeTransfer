<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import HelpFigure from '@/src/components/help/HelpFigure.vue'
import HelpText from '@/src/components/help/HelpText.vue'
import { HELP_CATEGORIES, articlesIn, findArticle } from '@/src/content/help'

/**
 * Un articolo del centro assistenza (`/aiuto/:slug`). L'app desktop rimanda qui a slug precisi:
 * uno slug sparito è un link rotto in un'app già installata, quindi gli slug non si rinominano.
 */

const route = useRoute()
const article = computed(() => findArticle(String(route.params.slug ?? '')))
const category = computed(() => HELP_CATEGORIES.find((c) => c.id === article.value?.category))
const related = computed(() => (article.value ? articlesIn(article.value.category).filter((a) => a.slug !== article.value!.slug) : []))
const updated = computed(() =>
  article.value ? new Date(article.value.updated).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
)

watch(
  article,
  (a) => {
    document.title = a ? `${a.title} · Aiuto Novren` : 'Aiuto Novren'
  },
  { immediate: true },
)
</script>

<template>
  <PublicShell>
    <div class="mx-auto w-full max-w-[860px] py-[clamp(36px,7vh,84px)]">
      <nav class="mb-8 flex flex-wrap items-center gap-2 font-mono text-[0.74rem] text-[#8d7fb8]" aria-label="Percorso">
        <RouterLink to="/aiuto" class="hover:text-[#F2ECFF]">Centro assistenza</RouterLink>
        <template v-if="category">
          <span aria-hidden="true">/</span>
          <span>{{ category.title }}</span>
        </template>
      </nav>

      <template v-if="article">
        <h1 class="mb-5 text-balance font-display text-[clamp(2.2rem,5.4vw,3.6rem)] leading-[1.02] tracking-[-0.035em] [font-weight:820]" data-test="help-title">
          {{ article.title }}
        </h1>
        <p class="max-w-[60ch] text-[clamp(1.05rem,1.6vw,1.2rem)] leading-relaxed text-[#b9ace2]">{{ article.summary }}</p>
        <p class="mt-3 font-mono text-[0.72rem] text-[#6a5f8c]">Aggiornato il {{ updated }}</p>

        <article class="mt-10 grid gap-5 text-[1.02rem] leading-[1.7] text-[#d9cff7]">
          <template v-for="(block, i) in article.blocks" :key="i">
            <h2 v-if="block.type === 'h'" class="mt-6 text-[1.4rem] font-bold leading-snug tracking-[-0.02em] text-[#F2ECFF]">{{ block.text }}</h2>

            <p v-else-if="block.type === 'p'" class="max-w-[66ch]"><HelpText :text="block.text" /></p>

            <ol v-else-if="block.type === 'steps'" class="grid max-w-[66ch] gap-3">
              <li v-for="(item, j) in block.items" :key="j" class="flex gap-3.5">
                <span class="mt-[3px] grid h-7 w-7 flex-none place-items-center rounded-[9px] bg-[#7c4dff] font-mono text-[0.8rem] font-bold text-white">{{ j + 1 }}</span>
                <span><HelpText :text="item" /></span>
              </li>
            </ol>

            <ul v-else-if="block.type === 'list'" class="grid max-w-[66ch] gap-2.5">
              <li v-for="(item, j) in block.items" :key="j" class="flex gap-3">
                <span class="mt-[11px] h-1.5 w-1.5 flex-none rounded-full bg-[#37e7c4]" aria-hidden="true" />
                <span><HelpText :text="item" /></span>
              </li>
            </ul>

            <aside
              v-else-if="block.type === 'tip'"
              class="max-w-[66ch] rounded-[16px] border p-4"
              :class="block.tone === 'warn' ? 'border-[#f2b84b]/40 bg-[#f2b84b]/[0.08]' : 'border-[#37e7c4]/35 bg-[#37e7c4]/[0.07]'"
            >
              <p v-if="block.title" class="mb-1 font-semibold" :class="block.tone === 'warn' ? 'text-[#f6cf86]' : 'text-[#7ff0d9]'">{{ block.title }}</p>
              <p class="text-[0.96rem]"><HelpText :text="block.text" /></p>
            </aside>

            <figure v-else-if="block.type === 'figure'" class="my-2 rounded-[22px] border border-white/10 bg-[#efeaff] p-5">
              <HelpFigure :figure="block.figure" />
              <figcaption class="mt-3 text-center font-mono text-[0.76rem] text-[#4923d1]">{{ block.caption }}</figcaption>
            </figure>

            <RouterLink v-else-if="block.type === 'related'" :to="block.to" class="inline-flex w-fit items-center gap-2 font-semibold text-[#37e7c4] underline-offset-4 hover:underline">
              {{ block.label }} →
            </RouterLink>
          </template>
        </article>

        <section v-if="related.length" class="mt-14 border-t border-white/10 pt-8">
          <h2 class="mb-4 text-[1.1rem] font-bold">Nella stessa sezione</h2>
          <ul class="grid gap-2">
            <li v-for="a in related" :key="a.slug">
              <RouterLink :to="`/aiuto/${a.slug}`" class="text-[#e6defb] underline-offset-4 hover:text-[#F2ECFF] hover:underline">{{ a.title }}</RouterLink>
            </li>
          </ul>
        </section>

        <section class="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-white/10 bg-white/[0.04] p-5">
          <p class="text-[0.98rem] text-[#b9ace2]">Non ha risolto? Scrivici: ogni messaggio lo legge una persona.</p>
          <RouterLink to="/feedback" class="rounded-[12px] bg-[#37e7c4] px-4 py-2.5 font-semibold text-[#160934]">Scrivici</RouterLink>
        </section>
      </template>

      <template v-else>
        <h1 class="mb-4 font-display text-[clamp(2rem,5vw,3rem)] [font-weight:820]" data-test="help-missing">Questo articolo non c’è.</h1>
        <p class="text-[#b9ace2]">Forse è stato spostato. <RouterLink to="/aiuto" class="text-[#37e7c4] underline underline-offset-4">Torna al centro assistenza</RouterLink>.</p>
      </template>
    </div>
  </PublicShell>
</template>
