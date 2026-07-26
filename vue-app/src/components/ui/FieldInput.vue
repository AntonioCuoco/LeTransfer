<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Campo di input della carta chiara (invio, ricezione, auth): un solo oggetto per
 * tutte le superfici pubbliche. Dettagli che i prodotti veri hanno e i template no:
 *  - etichetta mono numerata (01 / 02 …) — il form si legge come una sequenza
 *  - avviso BLOC MAIUSC sui campi password (lo fanno 1Password, GitHub, Cognito)
 *  - "mostra/nascondi" testuale invece dell'occhietto: coerente col resto in mono
 */

const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  index?: string
  type?: 'text' | 'email' | 'password'
  placeholder?: string
  error?: string | null
  hint?: string
  disabled?: boolean
  autocomplete?: string
  mono?: boolean
}>(), { type: 'text', mono: false })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const revealed = ref(false)
const capsLock = ref(false)

const inputType = computed(() => (props.type === 'password' && revealed.value ? 'text' : props.type))
const inputId = computed(() => `field-${props.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)

function onKey(event: KeyboardEvent) {
  if (props.type !== 'password') return
  capsLock.value = event.getModifierState?.('CapsLock') ?? false
}
</script>

<template>
  <div>
    <label :for="inputId" class="mb-1.5 flex items-baseline gap-2 font-mono text-[0.64rem] uppercase tracking-[0.18em] text-[#6a5f8c]">
      <span v-if="index" class="text-[#c3b6e6]">{{ index }}</span>
      {{ label }}
    </label>

    <div class="relative">
      <input
        :id="inputId"
        :value="modelValue"
        :type="inputType"
        :placeholder="placeholder"
        :disabled="disabled"
        :autocomplete="autocomplete"
        :aria-invalid="!!error"
        class="w-full rounded-[11px] border bg-white px-3 py-2.5 text-[0.92rem] outline-none transition-colors placeholder:font-normal placeholder:text-[#a79cc4] focus:border-[#724cf9] disabled:opacity-60"
        :class="[
          error ? 'border-[#e9b3af]' : 'border-[#e9e3f6]',
          mono || type === 'password' ? 'font-mono text-[0.86rem] placeholder:font-sans' : 'font-semibold',
          type === 'password' ? 'pr-[4.6rem]' : '',
        ]"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @keyup="onKey"
        @keydown="onKey"
      />
      <button
        v-if="type === 'password'"
        type="button"
        tabindex="-1"
        class="absolute right-2 top-1/2 -translate-y-1/2 rounded-[7px] px-2 py-1 font-mono text-[0.64rem] uppercase tracking-[0.1em] text-[#6a5f8c] transition-colors hover:bg-[#f0ebfa] hover:text-[#1b1140]"
        @click="revealed = !revealed"
      >
        {{ revealed ? 'nascondi' : 'mostra' }}
      </button>
    </div>

    <p v-if="error" class="mt-1.5 font-mono text-[0.72rem] text-[#b3352f]">{{ error }}</p>
    <p v-else-if="capsLock" class="mt-1.5 font-mono text-[0.72rem] text-[#8a6d1f]">bloc maiusc attivo</p>
    <p v-else-if="hint" class="mt-1.5 text-[0.76rem] leading-snug text-[#8a7fae]">{{ hint }}</p>
  </div>
</template>
