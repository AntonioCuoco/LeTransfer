<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { notify } from '@/src/utils/notify'
import { useAccountDeletion } from '@/src/composables/useAccountDeletion'

/**
 * Cancellazione dell'account — la finestra che deve spiegare, non convincere.
 *
 * **Perché due passi e non uno.** La cancellazione qui è *crittograficamente immediata*:
 * il server distrugge per primo il materiale delle chiavi, e da quell'istante nessuno —
 * noi per primi — può più aprire quei file. Non esiste un cestino, non esiste un
 * supporto che possa recuperare. Un prodotto che si comporta così deve dedicare una
 * schermata intera a dirlo, con i numeri di *questo* account, prima di chiedere conferma.
 *
 * Il passo 1 non ha nessun campo da compilare: è solo lettura. È voluto — chi arriva qui
 * per errore deve incontrare una spiegazione, non un modulo.
 *
 * **Il tono.** Nessun allarmismo, nessun tentativo di trattenere. Chi vuole andarsene ha
 * diritto di andarsene (art. 17), e un prodotto che vende privacy sarebbe ridicolo a fare
 * attrito qui. La drammaticità è nei *fatti*, non negli aggettivi.
 */

const CONFIRM_PHRASE = 'ELIMINA IL MIO ACCOUNT'

const { preview, isLoadingPreview, isDeleting, loadPreview, requestDeletion, wipeLocalData } =
  useAccountDeletion()

const visible = defineModel<boolean>('visible', { default: false })

const step = ref<1 | 2>(1)
const password = ref('')
const phrase = ref('')
const pendingEmail = ref<string | null>(null)

const canConfirm = computed(
  () => password.value.length > 0 && phrase.value.trim().toUpperCase() === CONFIRM_PHRASE,
)

watch(visible, (open) => {
  if (open) {
    step.value = 1
    password.value = ''
    phrase.value = ''
    pendingEmail.value = null
    loadPreview()
  }
})

async function confirm() {
  const outcome = await requestDeletion(password.value)

  switch (outcome.status) {
    case 'deleted':
      // Prima si pulisce il browser, poi si va via: la chiave privata RSA vive solo qui,
      // e lasciarla in un IndexedDB orfano sarebbe l'unico residuo di un account che il
      // server ha già dimenticato.
      await wipeLocalData()
      window.location.replace('/')
      break

    case 'confirmation_sent':
      // Percorso previsto ma non ancora attivo lato server (arriva con le email, O1.2).
      pendingEmail.value = outcome.email ?? null
      break

    case 'wrong_password':
      notify.error('Password non corretta.')
      password.value = ''
      break

    case 'unavailable':
      notify.info('La cancellazione automatica non è ancora attiva. Scrivici e la eseguiamo noi.')
      break

    default:
      notify.error('Non siamo riusciti a completare la richiesta. Riprova.')
  }
}

function close() {
  visible.value = false
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Elimina l'account"
    :style="{ width: 'min(560px, 94vw)' }"
    :draggable="false"
  >
    <!-- ── Passo 1 — cosa sta per succedere ──────────────────────────────────── -->
    <div v-if="step === 1" class="flex flex-col gap-4">
      <p class="m-0 text-sm leading-relaxed text-haze-200">
        Prenditi un minuto per leggere: questa operazione <strong class="text-haze-100">non è
        annullabile</strong>, e non lo è in un modo particolare che vale la pena capire.
      </p>

      <div class="rounded-well border border-white/10 bg-white/[0.03] p-4">
        <p class="m-0 mb-3 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-haze-400">
          Cosa sparisce
        </p>

        <div v-if="isLoadingPreview" class="text-sm text-haze-400">Conto i tuoi dati…</div>

        <dl v-else-if="preview" class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt class="text-haze-400">I tuoi file</dt>
          <dd class="m-0 font-semibold text-haze-100">{{ preview.files }}</dd>

          <dt class="text-haze-400">Link pubblici attivi</dt>
          <dd class="m-0 font-semibold text-haze-100">
            {{ preview.activeLinks }}
            <span class="font-normal text-haze-400">— smetteranno di funzionare</span>
          </dd>

          <dt class="text-haze-400">File condivisi con altri</dt>
          <dd class="m-0 font-semibold text-haze-100">
            <template v-if="preview.sharesToOthers >= 0">{{ preview.sharesToOthers }}</template>
            <template v-else>alcuni</template>
            <span class="font-normal text-haze-400">— chi li ha ricevuti perderà l'accesso</span>
          </dd>
        </dl>

        <p
          v-if="preview && !preview.isAuthoritative"
          class="m-0 mt-3 text-xs leading-relaxed text-haze-400"
        >
          Questi numeri sono una stima fatta da questo browser: il conteggio esatto lo farà il
          server al momento della cancellazione.
        </p>
      </div>

      <div class="rounded-well border border-warn-400/25 bg-warn-400/[0.06] p-4">
        <p class="m-0 text-sm font-semibold text-haze-100">Perché non si torna indietro</p>
        <p class="m-0 mt-1.5 text-xs leading-relaxed text-haze-300">
          La prima cosa che cancelliamo sono le <strong>chiavi</strong>. Da quel momento i tuoi file
          diventano illeggibili per chiunque — anche per noi, che già non potevamo aprirli, e anche
          per te. Non è un file spostato in un cestino: è un lucchetto di cui viene distrutta
          l'unica chiave esistente. Non c'è nessun ripristino, nessun periodo di ripensamento, e
          nessuna assistenza che possa recuperare nulla.
        </p>
      </div>

      <div class="text-xs leading-relaxed text-haze-400">
        <p class="m-0 mb-1.5">Spariscono anche:</p>
        <ul class="m-0 list-disc space-y-1 pl-5">
          <li>la tua chiave di recupero e il backup della chiave privata</li>
          <li>la cronologia dei trasferimenti e i file ricevuti da altri</li>
          <li>le tue credenziali di accesso</li>
          <li>tutto ciò che questa app ha salvato in questo browser</li>
        </ul>
        <p class="m-0 mt-3">
          Restano solo i <strong class="text-haze-300">documenti di fatturazione</strong>, che siamo
          obbligati per legge a conservare, e che non contengono i tuoi file.
        </p>
      </div>

      <p class="m-0 text-xs leading-relaxed text-haze-400">
        Se ti servono i tuoi file, scaricali <strong class="text-haze-300">prima</strong> di
        procedere: dopo non sarà più possibile.
      </p>
    </div>

    <!-- ── Passo 2 — conferma ────────────────────────────────────────────────── -->
    <div v-else class="flex flex-col gap-4">
      <div v-if="pendingEmail" class="rounded-well border border-white/10 bg-white/[0.03] p-4">
        <p class="m-0 text-sm font-semibold text-haze-100">Controlla la tua email</p>
        <p class="m-0 mt-1.5 text-xs leading-relaxed text-haze-300">
          Abbiamo inviato un link di conferma a <strong>{{ pendingEmail }}</strong>. L'account verrà
          eliminato solo dopo che l'avrai aperto.
        </p>
      </div>

      <template v-else>
        <p class="m-0 text-sm leading-relaxed text-haze-200">
          Ultimo passo. Ti chiediamo due cose: la password, perché nessuno che non sia tu possa
          farlo; e di scrivere la frase, perché non succeda per sbaglio.
        </p>

        <div class="flex flex-col gap-1.5">
          <label for="del-pwd" class="text-xs font-medium text-haze-300">La tua password</label>
          <Password
            id="del-pwd"
            v-model="password"
            :feedback="false"
            toggle-mask
            fluid
            autocomplete="current-password"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="del-phrase" class="text-xs font-medium text-haze-300">
            Scrivi <span class="font-mono text-haze-100">{{ CONFIRM_PHRASE }}</span>
          </label>
          <InputText id="del-phrase" v-model="phrase" fluid autocomplete="off" spellcheck="false" />
        </div>
      </template>
    </div>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <Button
          v-if="step === 2 && !pendingEmail"
          label="Indietro"
          text
          severity="secondary"
          @click="step = 1"
        />
        <span v-else />

        <div class="flex items-center gap-2">
          <Button :label="pendingEmail ? 'Chiudi' : 'Annulla'" text @click="close" />
          <Button
            v-if="step === 1"
            label="Ho capito, continua"
            severity="danger"
            outlined
            @click="step = 2"
          />
          <Button
            v-else-if="!pendingEmail"
            label="Elimina definitivamente"
            severity="danger"
            :disabled="!canConfirm"
            :loading="isDeleting"
            @click="confirm"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>
