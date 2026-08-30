<script setup lang="ts">
import { useRouter } from 'vue-router'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import { usePageEnter } from '@/src/composables/useMotion'

/**
 * Sicurezza — la pagina che un prodotto sulla privacy deve avere il coraggio di scrivere.
 * Tre sezioni: le primitive (verificabili nel codice), il modello di minaccia con quello
 * che NON copriamo, e la disclosure. La sezione onesta è quella centrale: i prodotti
 * seri (Signal, Tailscale, Proton) pubblicano i propri limiti, i template no.
 *
 * Ogni valore qui corrisponde a costanti reali in utils/crypto.ts.
 */

const router = useRouter()

/**
 * Quale build stai guardando.
 *
 * `VITE_BUILD_COMMIT` viene iniettato dalla pipeline che costruisce E pubblica il sito
 * (.github/workflows/reproducible-build.yml). In sviluppo non c'è, e allora la sezione
 * di verifica non si mostra: meglio tacere che invitare a verificare qualcosa che non
 * proviene da una build tracciata.
 */
const buildCommit = import.meta.env.VITE_BUILD_COMMIT as string | undefined
const shortCommit = buildCommit ? buildCommit.slice(0, 12) : null
const RELEASES_URL = 'https://github.com/AntonioCuoco/LeTransfer/releases'

/**
 * L'ambiente della build ufficiale, dichiarato perché senza di esso la verifica non
 * può riuscire: una versione diversa di Node produce byte diversi, e chi confronta
 * concluderebbe "manomesso" trovandosi davanti a un artefatto legittimo.
 *
 * ⚠️ Questi due valori devono seguire il workflow: `BUILD_NODE` è `vue-app/.nvmrc`,
 * `BUILD_RUNNER` è il `runs-on` di .github/workflows/reproducible-build.yml. Se lì
 * cambiano e qui no, questa pagina dice una cosa falsa.
 */
const BUILD_NODE = '22.20.0'
const BUILD_RUNNER = 'ubuntu-24.04 · linux x64'

const primitives = [
  { what: 'Contenuto dei file', how: 'AES-256-GCM', note: 'chiave per trasferimento, generata nel browser' },
  { what: 'Blocchi', how: 'IV a 96 bit per blocco + tag 128 bit', note: 'AAD = indice, blocca riordino e sostituzione' },
  { what: 'Chiavi tra utenti', how: 'RSA-OAEP 4096 / SHA-256', note: 'la chiave del file viaggia wrappata' },
  { what: 'Recovery key', how: 'mnemonica 24 parole (256 bit)', note: 'PBKDF2-SHA256, 100.000 iterazioni' },
  { what: 'Password dei link', how: 'Argon2 lato server', note: 'gate d’accesso, non chiave di cifratura' },
  { what: 'Trasporto', how: 'TLS 1.3', note: 'in aggiunta alla cifratura, non al posto suo' },
]

const covered = [
  'Chi gestisce i nostri server legge i tuoi file',
  'Una fuga di dati dallo storage espone i contenuti',
  'Un blocco del file viene sostituito o riordinato di nascosto',
  'Il nome del file finisce nei nostri log (invio senza account)',
]

const notCovered = [
  {
    title: 'Chi ha il link, ha il file',
    body: 'La chiave è nel link. Se lo inoltri in un gruppo, hai dato il file al gruppo. Password, scadenza e max download servono a questo.',
  },
  {
    title: 'Il dispositivo compromesso',
    body: 'Se il browser di chi invia o di chi riceve è infetto, la cifratura end-to-end non serve: i dati sono in chiaro prima e dopo il nostro pezzo di strada.',
  },
  {
    title: 'I metadati minimi',
    body: 'Vediamo dimensione, orario, indirizzo IP di chi carica e il nome del file — quest’ultimo perché la pagina di ricezione lo mostra prima di decifrare. Servono a far scadere i link e a fermare gli abusi. Non li vendiamo, ma non possiamo dire di non averli.',
  },
  {
    title: 'Il codice che ti serviamo',
    body: 'La cifratura avviene nel codice che ti mandiamo noi. Se qualcuno compromettesse la nostra distribuzione, potrebbe servirti codice ostile: è il limite strutturale di ogni E2E via browser. Il client è open-source proprio perché sia verificabile.',
  },
]

const { root: head } = usePageEnter()
</script>

<template>
  <PublicShell>
    <div ref="head" class="mx-auto w-full max-w-[980px] py-[clamp(40px,8vh,96px)]">
      <p data-enter class="mb-[22px] font-mono text-[0.74rem] uppercase tracking-[0.32em] text-[#37e7c4]">Sicurezza</p>
      <h1 data-enter class="mb-6 max-w-[15ch] text-balance font-display text-[clamp(2.6rem,7vw,5rem)] leading-[0.98] tracking-[-0.04em] [font-weight:840]">
        Quello che facciamo, e quello che no.
      </h1>
      <p data-enter class="max-w-[58ch] text-[clamp(1.05rem,1.6vw,1.24rem)] leading-relaxed text-[#b9ace2]">
        Un servizio che promette di proteggerti da tutto ti sta mentendo su qualcosa. Qui trovi le primitive
        che usiamo, e sotto la lista di ciò che la nostra crittografia <em class="not-italic text-[#F2ECFF]">non</em> può fare.
      </p>

      <!-- Primitive -->
      <section v-reveal class="mt-[clamp(48px,7vh,84px)]">
        <h2 class="mb-7 text-[clamp(1.5rem,3vw,2.2rem)] font-bold tracking-[-0.03em]">Le primitive</h2>
        <div class="border-t border-white/10">
          <div
            v-for="row in primitives"
            :key="row.what"
            class="grid gap-x-8 gap-y-1 border-b border-white/10 py-4 md:grid-cols-[minmax(0,220px)_minmax(0,270px)_1fr]"
          >
            <span class="text-[0.95rem] font-semibold">{{ row.what }}</span>
            <span class="font-mono text-[0.8rem] text-[#37e7c4]">{{ row.how }}</span>
            <span class="font-mono text-[0.74rem] text-[#8d7fb8]">{{ row.note }}</span>
          </div>
        </div>
      </section>

      <!-- Modello di minaccia -->
      <section v-reveal="{ stagger: 0.08 }" class="mt-[clamp(48px,7vh,84px)] grid gap-8 md:grid-cols-2">
        <div>
          <h2 class="mb-1.5 text-[clamp(1.4rem,2.6vw,1.85rem)] font-bold tracking-[-0.03em]">Da cosa ti protegge</h2>
          <p class="mb-5 text-[0.92rem] leading-relaxed text-[#8d7fb8]">Scenari coperti dal modo in cui è costruito il prodotto.</p>
          <ul class="flex flex-col gap-3">
            <li v-for="item in covered" :key="item" class="flex items-baseline gap-3 leading-relaxed text-[#b9ace2]">
              <span class="font-mono text-[#37e7c4]">✓</span>{{ item }}
            </li>
          </ul>
        </div>

        <div class="rounded-[18px] border border-[#e0b34a]/25 bg-[#e0b34a]/[0.06] p-6">
          <h2 class="mb-1.5 text-[clamp(1.4rem,2.6vw,1.85rem)] font-bold tracking-[-0.03em]">Da cosa non ti protegge</h2>
          <p class="mb-5 text-[0.92rem] leading-relaxed text-[#c0a878]">Scritto da noi, prima che lo scopra qualcun altro.</p>
          <div class="flex flex-col gap-5">
            <div v-for="item in notCovered" :key="item.title">
              <p class="mb-1 font-mono text-[0.78rem] uppercase tracking-[0.1em] text-[#e0b34a]">{{ item.title }}</p>
              <p class="text-[0.92rem] leading-relaxed text-[#d9cffa]">{{ item.body }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Stato attuale: niente vanterie non verificabili -->
      <section v-reveal class="mt-[clamp(48px,7vh,84px)]">
        <h2 class="mb-7 text-[clamp(1.5rem,3vw,2.2rem)] font-bold tracking-[-0.03em]">A che punto siamo</h2>
        <dl class="grid grid-cols-[1fr_auto] gap-x-6 border-t border-white/10 font-mono text-[0.8rem]">
          <dt class="border-b border-white/10 py-3.5 text-[#d9cffa]">Client open-source</dt>
          <dd class="border-b border-white/10 py-3.5 text-right font-bold text-[#37e7c4]">sì</dd>
          <dt class="border-b border-white/10 py-3.5 text-[#d9cffa]">Nucleo crittografico isolato e specificato</dt>
          <dd class="border-b border-white/10 py-3.5 text-right font-bold text-[#37e7c4]">sì · <span class="font-mono">src/crypto</span></dd>
          <dt class="border-b border-white/10 py-3.5 text-[#d9cffa]">Dati e storage in Unione Europea</dt>
          <dd class="border-b border-white/10 py-3.5 text-right font-bold text-[#37e7c4]">sì</dd>
          <dt class="border-b border-white/10 py-3.5 text-[#d9cffa]">Audit crittografico indipendente</dt>
          <dd class="border-b border-white/10 py-3.5 text-right text-[#e0b34a]">non ancora</dd>
          <dt class="border-b border-white/10 py-3.5 text-[#d9cffa]">Build riproducibili del client</dt>
          <dd v-if="shortCommit" class="border-b border-white/10 py-3.5 text-right font-bold text-[#37e7c4]">sì · verificabile</dd>
          <dd v-else class="border-b border-white/10 py-3.5 text-right text-[#e0b34a]">in lavorazione</dd>
          <dt class="border-b border-white/10 py-3.5 text-[#d9cffa]">Crittografia post-quantistica</dt>
          <dd class="border-b border-white/10 py-3.5 text-right text-[#e0b34a]">in roadmap</dd>
        </dl>
      </section>

      <!-- Verifica della build: l'unico modo per non doverci credere sulla parola.
           Compare SOLO se la pagina proviene da una build della pipeline (§ script). -->
      <section v-if="shortCommit" v-reveal class="mt-[clamp(48px,7vh,84px)] rounded-[18px] border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <p class="mb-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[#37e7c4]">Verificabile</p>
        <h2 class="mb-3 text-[clamp(1.25rem,2.4vw,1.6rem)] font-bold tracking-[-0.02em]">Controlla il codice che stai eseguendo.</h2>
        <p class="mb-5 max-w-[62ch] leading-relaxed text-[#b9ace2]">
          Sopra abbiamo scritto che la cifratura avviene nel codice che ti mandiamo noi, e che è il limite
          strutturale di ogni end-to-end nel browser. Questa è la contromisura: la pagina che stai leggendo
          è stata costruita <em class="not-italic text-[#F2ECFF]">e pubblicata</em> dalla stessa pipeline,
          senza passaggi manuali in mezzo. Puoi ricostruirla e confrontare i byte.
        </p>

        <dl class="mb-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 font-mono text-[0.76rem]">
          <dt class="text-[#8d7fb8]">commit</dt>
          <dd class="m-0 break-all text-[#F2ECFF]">{{ shortCommit }}</dd>
          <dt class="text-[#8d7fb8]">node</dt>
          <dd class="m-0 text-[#F2ECFF]">{{ BUILD_NODE }}</dd>
          <dt class="text-[#8d7fb8]">ambiente</dt>
          <dd class="m-0 text-[#F2ECFF]">{{ BUILD_RUNNER }}</dd>
          <dt class="text-[#8d7fb8]">manifesto</dt>
          <dd class="m-0">
            <a :href="RELEASES_URL" target="_blank" rel="noopener noreferrer" class="text-[#37e7c4] underline decoration-dotted underline-offset-2">
              SHA256SUMS.txt nelle release
            </a>
          </dd>
        </dl>

        <p class="mb-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#8d7fb8]">Come si verifica</p>
        <pre class="overflow-x-auto rounded-[12px] border border-white/10 bg-black/30 p-4 font-mono text-[0.74rem] leading-relaxed text-[#d9cffa]"><code>git clone https://github.com/AntonioCuoco/LeTransfer &amp;&amp; cd LeTransfer
git checkout {{ shortCommit }}
cd vue-app &amp;&amp; npm ci
VITE_BUILD_COMMIT={{ buildCommit }} NODE_ENV=production npm run build
cd dist &amp;&amp; find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum</code></pre>

        <p class="mt-4 max-w-[62ch] text-[0.88rem] leading-relaxed text-[#8d7fb8]">
          L'elenco che ottieni deve combaciare con il manifesto allegato alla release. Se non combacia,
          i byte serviti non vengono da questo sorgente — ed è esattamente ciò che questo meccanismo
          esiste per rendere visibile.
        </p>
        <p class="mt-3 max-w-[62ch] text-[0.88rem] leading-relaxed text-[#8d7fb8]">
          Due dettagli che fanno fallire la verifica se li salti, e non per colpa nostra:
          <code class="font-mono text-[0.82rem] text-[#d9cffa]">VITE_BUILD_COMMIT</code> non è
          facoltativo — il commit finisce dentro il bundle, e ometterlo cambia l'impronta di circa
          metà dei file. E la build va fatta con la versione di Node qui sopra: una diversa produce
          byte diversi. Parti da un clone pulito, senza creare un file
          <code class="font-mono text-[0.82rem] text-[#d9cffa]">.env</code>: la configurazione di
          produzione è già versionata nel repository.
        </p>
        <p class="mt-3 max-w-[62ch] text-[0.88rem] leading-relaxed text-[#c0a878]">
          Onestà sui limiti: il tuo browser non confronta nulla da solo. Questo rende una manomissione
          <em class="not-italic">rilevabile da chi controlla</em>, non impedita a te nel momento in cui
          apri la pagina. È la cosa più forte disponibile oggi per un'app web, non una garanzia assoluta.
        </p>
      </section>

      <!-- Disclosure -->
      <section v-reveal class="mt-[clamp(40px,6vh,72px)] rounded-[18px] border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <p class="mb-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[#37e7c4]">Hai trovato un problema?</p>
        <h2 class="mb-3 text-[clamp(1.25rem,2.4vw,1.6rem)] font-bold tracking-[-0.02em]">Scrivicelo prima di pubblicarlo.</h2>
        <p class="mb-5 max-w-[60ch] leading-relaxed text-[#b9ace2]">
          Rispondiamo entro 72 ore e non mandiamo avvocati a chi segnala in buona fede. Se il problema è nella
          crittografia, dillo pure senza girarci intorno: preferiamo una figuraccia oggi a un incidente domani.
        </p>
        <a
          href="mailto:security@novren.net"
          class="inline-block rounded-[13px] border border-white/15 bg-white/[0.06] px-5 py-3 font-mono text-[0.8rem] text-[#F2ECFF] transition hover:border-white/30"
        >
          security@novren.net
        </a>
      </section>

      <div class="mt-[clamp(40px,6vh,72px)] flex flex-wrap items-center gap-4">
        <button
          type="button"
          class="rounded-[13px] bg-[#724cf9] px-6 py-3.5 text-base font-bold tracking-[-0.01em] text-white shadow-[0_14px_30px_-12px_rgba(90,48,235,0.85)] transition hover:-translate-y-px hover:brightness-105"
          @click="router.push('/')"
        >
          Manda un file cifrato
        </button>
        <button
          type="button"
          class="font-mono text-[0.8rem] text-[#b9ace2] underline-offset-4 transition-colors hover:text-[#F2ECFF] hover:underline"
          @click="router.push('/come-funziona')"
        >
          Come funziona, passo per passo →
        </button>
      </div>
    </div>
  </PublicShell>
</template>
