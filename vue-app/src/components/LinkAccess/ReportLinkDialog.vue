<script setup lang="ts">
import { ref } from 'vue'
import { useGuestModeration, REPORT_REASONS, type ReportReason } from '@/src/composables/useGuestModeration'

/**
 * Segnalazione di un link (roadmap F1.5).
 *
 * È la parte visibile del solo meccanismo anti-abuso che funziona davvero su un canale
 * zero-knowledge: **noi il file non possiamo guardarlo, chi lo riceve sì**. Le
 * segnalazioni alimentano il contatore che manda il link in quarantena automatica.
 *
 * Tono: sobrio, in fondo alla pagina, senza allarmismo. Chi arriva qui ha ricevuto un
 * link da qualcuno di cui probabilmente si fida — l'obiettivo non è insinuare il
 * sospetto, è che chi *ha già* un sospetto trovi la leva senza doverla cercare.
 *
 * Cosa NON promettiamo: che il link sparisca. Il backend risponde `202` a chiunque, e
 * la quarantena scatta a soglia; dire "rimosso" sarebbe falso e trasformerebbe questa
 * finestra in un modo per censurare il link di un altro.
 */

const props = defineProps<{ publicToken: string }>()

const { isReporting, reportLink } = useGuestModeration()

const open = ref(false)
const reason = ref<ReportReason>('malware')
const sent = ref(false)

async function submit() {
  const ok = await reportLink(props.publicToken, reason.value)
  // Anche in caso di errore di rete mostriamo la conferma: il backend risponde comunque
  // in modo generico, e un "non è riuscito" spingerebbe a insistere su un endpoint che
  // sta già facendo rate limiting.
  sent.value = true
  if (!ok) return
}

function close() {
  open.value = false
  // Ripristina dopo la chiusura, così riaprendo non si ritrova la conferma di prima.
  window.setTimeout(() => { sent.value = false }, 200)
}
</script>

<template>
  <div class="pt-1 text-center">
    <button
      type="button"
      class="font-mono text-[0.68rem] text-[#8d7fb8] underline-offset-4 transition-colors hover:text-[#F2ECFF] hover:underline"
      @click="open = true"
    >
      Segnala questo file
    </button>

    <!-- Dialogo a mano e non PrimeVue: questa pagina è "mondo pubblico", con la carta
         chiara e il viola pieno, e non deve tirarsi dietro il tema dell'area app. -->
    <Teleport to="body">
      <div
        v-if="open"
        class="fixed inset-0 z-50 grid place-items-center bg-[#0b041c]/70 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        @click.self="close"
      >
        <div class="lt-card w-[min(420px,100%)] p-5 text-left">
          <template v-if="!sent">
            <h2 id="report-title" class="text-[1.05rem] font-bold tracking-[-0.02em]">Segnala questo file</h2>
            <p class="mt-1.5 text-[0.86rem] leading-relaxed text-[#6a5f8c]">
              Il file è cifrato: noi non possiamo aprirlo per controllare. Chi lo riceve sì — per questo la
              segnalazione conta.
            </p>

            <fieldset class="mt-4">
              <legend class="lt-label mb-2">Motivo</legend>
              <label
                v-for="option in REPORT_REASONS"
                :key="option.value"
                class="flex cursor-pointer items-center gap-2.5 rounded-[11px] px-2 py-2 text-[0.88rem] transition-colors hover:bg-[#f5f1fd]"
              >
                <input v-model="reason" type="radio" :value="option.value" name="report-reason" class="accent-[#724cf9]" />
                {{ option.label }}
              </label>
            </fieldset>

            <p class="mt-3 font-mono text-[0.68rem] leading-normal text-[#8a7fae]">
              Le segnalazioni mettono il link in quarantena al raggiungimento di una soglia — non lo
              rimuovono all'istante. Non ci mandi il file, né una sua copia.
            </p>

            <div class="mt-4 flex gap-2">
              <button type="button" class="lt-btn-ghost flex-1" @click="close">Annulla</button>
              <button v-lift type="button" class="lt-btn flex-1" :disabled="isReporting" @click="submit">
                {{ isReporting ? 'Invio…' : 'Segnala' }}
              </button>
            </div>
          </template>

          <template v-else>
            <h2 id="report-title" class="text-[1.05rem] font-bold tracking-[-0.02em]">Segnalazione ricevuta</h2>
            <p class="mt-1.5 text-[0.86rem] leading-relaxed text-[#6a5f8c]">
              Grazie. Se il link raggiunge la soglia di segnalazioni viene messo in quarantena
              automaticamente e smette di funzionare.
            </p>
            <button v-lift type="button" class="lt-btn mt-4" @click="close">Chiudi</button>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>
