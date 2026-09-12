<script setup lang="ts">
import { computed } from 'vue'
import { notify } from '@/src/utils/notify'
import { useAccountExport } from '@/src/composables/useAccountExport'

/**
 * «Scarica tutto» — portabilità dei dati (GDPR art. 20).
 *
 * Sta **sopra** la cancellazione dell'account, e non è una scelta estetica: chi arriva in
 * fondo a questa pagina per andarsene deve incontrare prima il modo di portarsi via i
 * propri file. Il dialogo di cancellazione dice «scaricali prima di procedere»: questo è
 * il posto dove farlo.
 *
 * Il progresso è per file e non in percentuale sui byte: la dimensione totale in chiaro
 * non la conosciamo prima di aver decifrato, e una barra che si muove a scatti dicendo
 * numeri inventati è peggio di un conteggio onesto.
 */

const {
  phase,
  filesTotal,
  filesDone,
  currentFile,
  skipped,
  errorMessage,
  blocker,
  startExport,
} = useAccountExport()

const isRunning = computed(() => phase.value === 'listing' || phase.value === 'archiving')

async function run() {
  const reason = blocker()
  if (reason) {
    notify.info(reason.message)
    return
  }
  await startExport()
  if (phase.value === 'done') {
    notify.success(
      filesTotal.value === 0
        ? 'Non ci sono file da esportare.'
        : 'Archivio creato.',
    )
  } else if (phase.value === 'error') {
    notify.error(errorMessage.value ?? 'Non siamo riusciti a creare l’archivio.', 'Esportazione non riuscita')
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-4">
    <div class="min-w-0">
      <h4 class="m-0 font-medium text-haze-100">Scarica i tuoi dati</h4>
      <p class="m-0 mt-1 max-w-[64ch] text-xs leading-relaxed text-haze-400">
        Un unico archivio con tutti i tuoi file, decifrati in questo browser, più l'elenco di
        cosa contiene. Nessun file in chiaro passa dai nostri server: la decifratura avviene
        qui, mentre l'archivio si forma.
      </p>

      <div v-if="isRunning" class="mt-2 font-mono text-[0.72rem] text-haze-300">
        {{ phase === 'listing' ? 'Cerco i tuoi file…' : `${filesDone} di ${filesTotal}` }}
        <span v-if="currentFile" class="text-haze-400">· {{ currentFile }}</span>
      </div>

      <p v-else-if="phase === 'error'" class="mt-2 text-xs text-warn-400">
        {{ errorMessage }}
      </p>

      <p v-else-if="phase === 'done' && skipped.length" class="mt-2 text-xs leading-relaxed text-warn-400">
        {{ skipped.length }} file non sono entrati nell'archivio perché non è stato possibile
        recuperarne la chiave. L'elenco è dentro <span class="font-mono">contenuto.json</span>.
      </p>
    </div>

    <Button
      label="Scarica tutto"
      icon="pi pi-download"
      outlined
      size="small"
      :loading="isRunning"
      @click="run"
    />
  </div>
</template>
