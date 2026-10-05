<script setup lang="ts">
import PublicShell from '@/src/components/landing/PublicShell.vue'
import { useRouter } from 'vue-router'
import { usePageEnter } from '@/src/composables/useMotion'

/**
 * "Come funziona" — la spiegazione tecnica come contenuto, non come marketing.
 * Struttura a binario numerato (Stripe docs): a sinistra il passo in parole umane,
 * a destra il fatto tecnico in mono. Ogni numero corrisponde a codice che esiste
 * davvero in crypto/crypto.ts e stores/guestUpload.ts.
 */

const router = useRouter()
const { root: head } = usePageEnter()

const steps = [
  {
    n: '01',
    title: 'Scegli i file',
    body: 'Restano sul tuo dispositivo. Più file o una cartella vengono impacchettati in uno zip prodotto in streaming: non passa mai per la memoria intera, nemmeno la tua.',
    facts: [['dove', 'solo nel tuo browser'], ['multi-file', 'zip in streaming (client-zip)']],
  },
  {
    n: '02',
    title: 'Nasce una chiave',
    body: 'Il browser genera una chiave AES a 256 bit con il generatore crittografico del sistema operativo. Non passa dal nostro server: il nostro server, in questo momento, non sa nemmeno che esisti.',
    facts: [['algoritmo', 'AES-256-GCM'], ['origine', 'crypto.subtle.generateKey()']],
  },
  {
    n: '03',
    title: 'Il file diventa ciphertext',
    body: 'La cifratura avviene a blocchi da 10 MB mentre l’upload è già partito. Ogni blocco ha il suo IV e il suo tag di autenticazione, e porta scritto dentro il proprio numero d’ordine: nessuno può riordinarli o sostituirne uno senza che la decifratura fallisca.',
    facts: [['blocco', '[IV 12B][ciphertext + tag 16B]'], ['anti-riordino', 'AAD = indice del chunk']],
  },
  {
    n: '04',
    title: 'La chiave finisce nel link',
    body: 'Il link che ottieni ha una parte dopo il cancelletto. Quella parte, per come è fatto il web, il browser non la manda mai al server: resta sul tuo schermo, e poi su quello di chi apre il link.',
    facts: [['forma', '/share/<token>#key=…&iv=…'], ['visto dal server', 'niente, mai']],
  },
  {
    n: '05',
    title: 'Chi riceve decifra',
    body: 'Il destinatario scarica i blocchi cifrati e li apre nel suo browser, uno alla volta, scrivendo direttamente su disco. Anche un file da decine di GB non riempie la RAM di nessuno.',
    facts: [['dove', 'nel browser di chi riceve'], ['scrittura', 'File System Access API']],
  },
]

/**
 * ⚠️ Questa tabella è una dichiarazione pubblica: ogni riga deve corrispondere al
 * codice, non a come ci piacerebbe che fosse.
 *
 * Correzione del 2026-08-02: qui c'era scritto che il nome del file il server **non**
 * lo vede negli invii senza account. Era **falso**. Il client lo manda in
 * `guest/upload/init` e di nuovo in `complete` ([stores/guestUpload.ts](../stores/guestUpload.ts)),
 * il backend lo salva nel record `SharedLinks` (BACKEND_API_DOCS §3.2) e la pagina di
 * ricezione lo mostra *prima* di decifrare — quindi non potrebbe essere altrimenti.
 * Come renderlo vero davvero: FRONTEND_WORKORDER_ROADMAP §F2 "nome del file cifrato".
 */
// Aggiornato il 2026-10-05: da O2.2 il nome **è cifrato** con la chiave del file
// (`encryptFileName`, `nameVersion: 2`), anche negli invii senza account. Il tipo di file
// invece si vede: serve ad anteprime e icone, ed è l'eccezione che va detta.
const serverKnows = [
  ['Blocchi cifrati', 'sì — sono l’unica cosa che riceve', false],
  ['Dimensione e data', 'sì — servono a far scadere il link', false],
  ['Indirizzo IP di chi carica', 'sì — serve contro gli abusi', false],
  ['Il tipo di file', 'sì — serve ad anteprime e icone', false],
  ['Il nome del file', 'no — è cifrato con la chiave del file', true],
  ['Il contenuto del file', 'no', true],
  ['La chiave di cifratura', 'no — non l’ha mai vista', true],
]
</script>

<template>
  <PublicShell>
    <div ref="head" class="mx-auto w-full max-w-[980px] py-[clamp(40px,8vh,96px)]">
      <p data-enter class="mb-[22px] font-mono text-[0.74rem] uppercase tracking-[0.32em] text-[#37e7c4]">Come funziona</p>
      <h1 data-enter class="mb-6 max-w-[14ch] text-balance font-display text-[clamp(2.6rem,7vw,5rem)] leading-[0.98] tracking-[-0.04em] [font-weight:840]">
        Cinque passi, zero fiducia.
      </h1>
      <p data-enter class="max-w-[58ch] text-[clamp(1.05rem,1.6vw,1.24rem)] leading-relaxed text-[#b9ace2]">
        "Zero fiducia" non è uno slogan: è la descrizione letterale di quello che succede quando premi
        <em class="not-italic text-[#F2ECFF]">Cifra e crea il link</em>. Ecco ogni passaggio, senza semplificazioni gentili.
      </p>

      <!-- Binario numerato. Il reveal è a scaglioni sui passi: sono una sequenza,
           e leggerli comparire in ordine è il contenuto stesso. -->
      <ol v-reveal="{ stagger: 0.06 }" class="mt-[clamp(48px,7vh,84px)] border-t border-white/10">
        <li
          v-for="step in steps"
          :key="step.n"
          class="grid gap-x-8 gap-y-4 border-b border-white/10 py-8 md:grid-cols-[auto_1fr_minmax(0,300px)]"
        >
          <span class="font-mono text-[0.9rem] tracking-[0.1em] text-[#37e7c4]">{{ step.n }}</span>
          <div>
            <h2 class="mb-2.5 text-[clamp(1.3rem,2.4vw,1.75rem)] font-bold tracking-[-0.02em]">{{ step.title }}</h2>
            <p class="max-w-[52ch] leading-relaxed text-[#b9ace2]">{{ step.body }}</p>
          </div>
          <dl class="grid h-fit grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[12px] border border-white/10 bg-white/[0.03] p-3.5 font-mono text-[0.7rem]">
            <template v-for="[label, value] in step.facts" :key="label">
              <dt class="text-[#8d7fb8]">{{ label }}</dt>
              <dd class="break-words text-[#d9cffa]">{{ value }}</dd>
            </template>
          </dl>
        </li>
      </ol>

      <!-- Cosa sa il server: la tabella che nessun concorrente pubblica -->
      <section v-reveal class="mt-[clamp(48px,7vh,84px)]">
        <h2 class="mb-1.5 text-[clamp(1.5rem,3vw,2.2rem)] font-bold tracking-[-0.03em]">Cosa sa il nostro server</h2>
        <p class="mb-7 max-w-[52ch] leading-relaxed text-[#b9ace2]">
          La domanda giusta da fare a un servizio di trasferimento file. Questa è la nostra risposta completa.
        </p>
        <dl class="grid grid-cols-[1fr_auto] gap-x-6 border-t border-white/10 font-mono text-[0.8rem]">
          <template v-for="[label, value, good] in serverKnows" :key="label">
            <dt class="border-b border-white/10 py-3.5 text-[#d9cffa]">{{ label }}</dt>
            <dd class="border-b border-white/10 py-3.5 text-right" :class="good ? 'font-bold text-[#37e7c4]' : 'text-[#8d7fb8]'">{{ value }}</dd>
          </template>
        </dl>
      </section>

      <!-- Il caveat, detto per primo da noi -->
      <section v-reveal class="mt-[clamp(40px,6vh,72px)] rounded-[18px] border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <p class="mb-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[#e0b34a]">Il rovescio della medaglia</p>
        <h2 class="mb-3 text-[clamp(1.25rem,2.4vw,1.6rem)] font-bold tracking-[-0.02em]">Chi ha il link, ha il file.</h2>
        <p class="max-w-[60ch] leading-relaxed text-[#b9ace2]">
          La chiave sta nel link: è ciò che ci impedisce di leggere i tuoi file, ed è anche ciò che rende il link
          una chiave vera e propria. Trattalo come tale. Per i casi delicati usa una <b class="text-[#F2ECFF]">password</b>
          comunicata a voce, un <b class="text-[#F2ECFF]">numero massimo di download</b>, o una
          <b class="text-[#F2ECFF]">scadenza breve</b>: sono tre opzioni, non tre piani a pagamento.
        </p>
      </section>

      <div class="mt-[clamp(40px,6vh,72px)] flex flex-wrap items-center gap-4">
        <button
          type="button"
          class="rounded-[13px] bg-[#724cf9] px-6 py-3.5 text-base font-bold tracking-[-0.01em] text-white shadow-[0_14px_30px_-12px_rgba(90,48,235,0.85)] transition hover:-translate-y-px hover:brightness-105"
          @click="router.push('/')"
        >
          Provalo con un file
        </button>
        <button
          type="button"
          class="font-mono text-[0.8rem] text-[#b9ace2] underline-offset-4 transition-colors hover:text-[#F2ECFF] hover:underline"
          @click="router.push('/sicurezza')"
        >
          Vedi le primitive crittografiche →
        </button>
      </div>
    </div>
  </PublicShell>
</template>
