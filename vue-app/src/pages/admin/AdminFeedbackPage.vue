<script setup lang="ts">
/**
 * I feedback e le richieste di aiuto arrivati dal form (sito, area autenticata, app desktop).
 * Si leggono tutti: lo stato dice a che punto è ognuno, la nota interna cosa si è fatto.
 * Ogni cambio finisce nel registro.
 */
import { onMounted, reactive, ref, watch } from 'vue'
import { FEEDBACK_KINDS, useAdminFeedback, type FeedbackItem, type FeedbackKind, type FeedbackStatus } from '@/src/composables/useFeedback'
import { notify } from '@/src/utils/notify'
import { withDetail } from '@/src/utils/errorDetail'

const { items, counts, isLoading, error, load, update } = useAdminFeedback()

const STATUSES: { value: FeedbackStatus; label: string }[] = [
  { value: 'nuovo', label: 'Nuovi' },
  { value: 'letto', label: 'Letti' },
  { value: 'risposto', label: 'Risposti' },
  { value: 'archiviato', label: 'Archiviati' },
]
const SOURCE_LABEL: Record<string, string> = { landing: 'Sito pubblico', web: 'Sito, con account', desktop: 'App desktop' }

const status = ref<FeedbackStatus | null>('nuovo')
const kind = ref<FeedbackKind | null>(null)
const notes = reactive<Record<string, string>>({})
const saving = ref<string | null>(null)

const kindLabel = (k: FeedbackKind) => FEEDBACK_KINDS.find((x) => x.value === k)?.label ?? k

async function reload() {
  await load({ status: status.value, kind: kind.value })
  for (const item of items.value) notes[item.feedbackId] = item.note ?? ''
}

onMounted(reload)
watch([status, kind], reload)

async function setStatus(item: FeedbackItem, next: FeedbackStatus) {
  await save(item, { status: next })
  // Passato a un altro stato: esce dalla lista filtrata.
  if (status.value && next !== status.value) await reload()
}

async function saveNote(item: FeedbackItem) {
  await save(item, { note: notes[item.feedbackId] ?? '' })
  notify.success('Nota salvata')
}

async function save(item: FeedbackItem, changes: { status?: FeedbackStatus; note?: string }) {
  saving.value = item.feedbackId
  try {
    await update(item.feedbackId, changes)
  } catch (e) {
    notify.error(withDetail('Modifica non salvata.', e))
  } finally {
    saving.value = null
  }
}

function replyTo(item: FeedbackItem): string | null {
  return item.accountEmail || item.contactEmail || null
}

function mailto(item: FeedbackItem): string {
  const subject = encodeURIComponent('Novren — il tuo messaggio')
  const body = encodeURIComponent(`\n\n— Il tuo messaggio del ${new Date(item.createdAt).toLocaleDateString('it-IT')}:\n> ${item.message.split('\n').join('\n> ')}`)
  return `mailto:${replyTo(item)}?subject=${subject}&body=${body}`
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <header>
      <h1 class="m-0 text-xl font-semibold text-haze-100">Feedback</h1>
      <p class="m-0 mt-1 text-sm text-haze-400">Idee, problemi e richieste di aiuto dal form del sito e dell'app. Ogni cambio di stato o nota finisce nel registro.</p>
    </header>

    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="s in STATUSES"
        :key="s.value"
        type="button"
        class="rounded-full border px-3.5 py-1.5 text-sm transition-colors"
        :class="status === s.value ? 'border-[#8b6bff] bg-[#724cf9]/25 text-haze-100' : 'border-white/10 text-haze-300 hover:border-white/25'"
        @click="status = s.value"
      >
        {{ s.label }} <span class="font-mono text-xs text-haze-400">{{ counts[s.value] ?? 0 }}</span>
      </button>
      <button
        type="button"
        class="rounded-full border px-3.5 py-1.5 text-sm transition-colors"
        :class="status === null ? 'border-[#8b6bff] bg-[#724cf9]/25 text-haze-100' : 'border-white/10 text-haze-300 hover:border-white/25'"
        @click="status = null"
      >
        Tutti
      </button>
      <span class="flex-1" />
      <select v-model="kind" class="rounded-well border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-haze-100">
        <option :value="null">Ogni tipo</option>
        <option v-for="k in FEEDBACK_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
      </select>
    </div>

    <div v-if="isLoading" class="text-sm text-haze-400">Carico…</div>
    <p v-else-if="error" class="text-sm text-[#ff8a9b]">{{ error }}</p>
    <p v-else-if="items.length === 0" class="text-sm text-haze-500">Niente qui.</p>

    <ul v-else class="m-0 flex flex-col gap-3 p-0">
      <li v-for="item in items" :key="item.feedbackId" class="list-none rounded-well border border-white/10 bg-white/[0.03] p-4">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="font-mono text-haze-500">{{ new Date(item.createdAt).toLocaleString('it-IT') }}</span>
          <Tag :value="kindLabel(item.kind)" :severity="item.kind === 'problema' ? 'danger' : item.kind === 'aiuto' ? 'warn' : 'secondary'" />
          <span class="text-haze-400">{{ SOURCE_LABEL[item.source] ?? item.source }}<template v-if="item.appVersion"> · v{{ item.appVersion }}</template><template v-if="item.platform"> · {{ item.platform }}</template></span>
          <span class="flex-1" />
          <span class="text-haze-300">{{ item.accountEmail || item.contactEmail || 'anonimo' }}<template v-if="item.userId"> (account)</template></span>
        </div>

        <p class="m-0 mt-3 whitespace-pre-wrap text-sm leading-relaxed text-haze-100">{{ item.message }}</p>
        <p v-if="item.page" class="m-0 mt-2 font-mono text-[0.7rem] text-haze-500">dalla pagina {{ item.page }}</p>

        <div class="mt-4 flex flex-col gap-2">
          <textarea
            v-model="notes[item.feedbackId]"
            rows="2"
            maxlength="1000"
            placeholder="Nota interna: cosa si è fatto, cosa si è risposto…"
            class="w-full resize-y rounded-well border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-haze-100 outline-none placeholder:text-haze-500 focus:border-[#8b6bff]"
          />
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="rounded-full border border-white/15 px-3 py-1 text-xs text-haze-200 hover:border-white/30 disabled:opacity-50" :disabled="saving === item.feedbackId || (notes[item.feedbackId] ?? '') === (item.note ?? '')" @click="saveNote(item)">Salva nota</button>
            <a v-if="replyTo(item)" :href="mailto(item)" class="rounded-full border border-white/15 px-3 py-1 text-xs text-haze-200 hover:border-white/30">Rispondi via email</a>
            <span class="flex-1" />
            <span class="text-xs text-haze-500">Segna come</span>
            <button
              v-for="s in STATUSES.filter((x) => x.value !== item.status)"
              :key="s.value"
              type="button"
              class="rounded-full border border-white/15 px-3 py-1 text-xs text-haze-200 hover:border-white/30 disabled:opacity-50"
              :disabled="saving === item.feedbackId"
              @click="setStatus(item, s.value)"
            >
              {{ s.value }}
            </button>
          </div>
          <p v-if="item.updatedAt" class="m-0 text-[0.7rem] text-haze-500">Ultima modifica {{ new Date(item.updatedAt).toLocaleString('it-IT') }} · {{ item.updatedBy }}</p>
        </div>
      </li>
    </ul>
  </div>
</template>
