<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { notify } from '@/src/utils/notify'
import QrCode from '@/src/components/ui/QrCode.vue'
import { useTwoFactor } from '@/src/composables/useTwoFactor'

/**
 * Verifica in due passaggi — attivazione e disattivazione.
 *
 * Il testo dice due cose che di solito non si dicono, e che qui contano:
 *  1. **cosa protegge davvero** — l'accesso all'account, non i file: chi ha la tua password
 *     non può comunque aprirli;
 *  2. **cosa non fa** — non ti riporta dentro se perdi il telefono. Per quello serve la
 *     chiave di recupero, che vive su un piano diverso.
 *
 * Chi vende sicurezza non può permettersi di lasciare che l'utente si costruisca da solo
 * un modello mentale sbagliato di cosa lo sta proteggendo.
 */

const props = defineProps<{ email: string }>()

const { status, isBusy, errorMessage, secret, otpauthUri, refreshStatus, beginSetup, confirmSetup, disable, checkCode } =
  useTwoFactor()

const setupOpen = ref(false)
const disableOpen = ref(false)
const code = ref('')

onMounted(refreshStatus)

async function openSetup() {
  code.value = ''
  const ok = await beginSetup(props.email)
  if (!ok) {
    notify.error(errorMessage.value ?? 'Non siamo riusciti ad avviare l’attivazione.', 'Attivazione non avviata')
    return
  }
  setupOpen.value = true
}

async function confirm() {
  if (await confirmSetup(code.value)) {
    setupOpen.value = false
    notify.success('Verifica in due passaggi attiva.')
  } else {
    notify.error(errorMessage.value ?? 'Attivazione non riuscita.', 'Attivazione non riuscita')
  }
}

async function confirmDisable() {
  // Il motivo lo decide Cognito: codice rifiutato, sessione scaduta, rete. Non sempre «codice non valido».
  if (!(await checkCode(code.value))) {
    notify.error(errorMessage.value ?? 'Disattivazione non riuscita.', 'Disattivazione non riuscita')
    return
  }
  if (await disable()) {
    disableOpen.value = false
    notify.success('Verifica in due passaggi disattivata.')
  } else {
    notify.error(errorMessage.value ?? 'Non siamo riusciti a disattivarla.', 'Disattivazione non riuscita')
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-4">
    <div class="min-w-0">
      <h4 class="m-0 font-medium text-haze-100">Verifica in due passaggi</h4>
      <p class="m-0 mt-1 max-w-[64ch] text-xs leading-relaxed text-haze-400">
        Un codice dall'app di autenticazione, oltre alla password. Protegge
        <strong class="text-haze-300">l'accesso all'account</strong>: i tuoi file restano
        illeggibili a chiunque abbia solo la password, perché la chiave non è mai stata sul
        nostro server.
      </p>
    </div>

    <span v-if="status === 'unknown'" class="font-mono text-[0.74rem] text-haze-400">…</span>
    <span v-else-if="status === 'on'" class="flex items-center gap-3">
      <span class="font-mono text-[0.74rem] text-verified-400">attiva ✓</span>
      <Button label="Disattiva" text severity="secondary" size="small" @click="code = ''; disableOpen = true" />
    </span>
    <Button v-else label="Attiva" outlined size="small" :loading="isBusy" @click="openSetup" />
  </div>

  <!-- Attivazione -->
  <Dialog v-model:visible="setupOpen" modal header="Attiva la verifica in due passaggi" :style="{ width: 'min(520px, 94vw)' }">
    <div class="flex flex-col gap-4">
      <p class="m-0 text-sm leading-relaxed text-haze-200">
        Inquadra il codice con la tua app di autenticazione (Google Authenticator, Aegis, 1Password
        — qualunque app TOTP), poi scrivi qui il codice a sei cifre che ti mostra.
      </p>

      <div v-if="otpauthUri" class="flex justify-center rounded-well bg-white p-4">
        <QrCode :value="otpauthUri" :size="184" />
      </div>

      <details class="text-xs text-haze-400">
        <summary class="cursor-pointer">Non riesci a inquadrare? Inserisci il codice a mano</summary>
        <p class="m-0 mt-2 break-all font-mono text-[0.78rem] text-haze-200">{{ secret }}</p>
      </details>

      <div class="flex flex-col gap-1.5">
        <label for="totp-code" class="text-xs font-medium text-haze-300">Codice a sei cifre</label>
        <InputText id="totp-code" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" fluid />
      </div>

      <p class="m-0 rounded-well border border-warn-400/25 bg-warn-400/[0.06] p-3 text-xs leading-relaxed text-haze-300">
        <strong class="text-haze-100">Se perdi il dispositivo</strong>, il secondo fattore non ti
        riporta dentro e nessuno può farlo al posto tuo. Conserva i codici della tua app di
        autenticazione dove conservi la chiave di recupero.
      </p>
    </div>

    <template #footer>
      <Button label="Annulla" text @click="setupOpen = false" />
      <Button label="Attiva" :disabled="code.trim().length < 6" :loading="isBusy" @click="confirm" />
    </template>
  </Dialog>

  <!-- Disattivazione -->
  <Dialog v-model:visible="disableOpen" modal header="Disattiva la verifica in due passaggi" :style="{ width: 'min(460px, 94vw)' }">
    <div class="flex flex-col gap-4">
      <p class="m-0 text-sm leading-relaxed text-haze-200">
        Per disattivarla ti chiediamo un codice valido: senza, basterebbe una sessione rubata per
        togliere proprio la protezione che serve contro quel caso.
      </p>
      <div class="flex flex-col gap-1.5">
        <label for="totp-off" class="text-xs font-medium text-haze-300">Codice a sei cifre</label>
        <InputText id="totp-off" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" fluid />
      </div>
    </div>

    <template #footer>
      <Button label="Annulla" text @click="disableOpen = false" />
      <Button
        label="Disattiva"
        severity="danger"
        :disabled="code.trim().length < 6"
        :loading="isBusy"
        @click="confirmDisable"
      />
    </template>
  </Dialog>
</template>
