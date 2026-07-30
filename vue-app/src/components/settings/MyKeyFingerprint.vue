<script setup lang="ts">
import { onMounted, ref } from 'vue'
import KeyFingerprint from '@/src/components/ui/KeyFingerprint.vue'
import { useUserKeyPair } from '@/src/composables/useUserKeyPair'
import { jwkThumbprint } from '@/src/utils/fingerprint'

/**
 * La MIA impronta (roadmap F2).
 *
 * Senza questa schermata la verifica del destinatario è monca: chi condivide vede
 * l'impronta dell'altro, ma l'altro non ha modo di leggere la propria per confermarla.
 * È la metà mancante della stessa funzione, non un vezzo da pagina impostazioni.
 */

const { publicKey, exportPublicKeyJWK, initializeKeyPair } = useUserKeyPair()

const thumbprint = ref('')
const error = ref('')

onMounted(async () => {
  try {
    if (!publicKey.value) await initializeKeyPair()
    const jwk = await exportPublicKeyJWK()
    if (!jwk) { error.value = 'Chiavi non ancora disponibili su questo dispositivo.'; return }
    thumbprint.value = await jwkThumbprint(jwk)
  } catch {
    error.value = 'Impossibile calcolare l’impronta della tua chiave.'
  }
})
</script>

<template>
  <div class="rounded-panel border border-shell-700 bg-shell-800 p-5">
    <h3 class="m-0 mb-1 text-lg font-semibold text-white">La tua impronta</h3>
    <p class="mb-4 mt-0 max-w-[62ch] text-sm leading-relaxed text-haze-300">
      È il riassunto della tua chiave pubblica. Quando qualcuno sta per mandarti un file cifrato,
      il suo schermo mostra queste stesse coppie: leggetevele a voce e saprete che nessuno si è
      messo in mezzo. Non è un segreto — puoi pubblicarla ovunque.
    </p>

    <p v-if="error" class="m-0 text-sm text-warn-400">{{ error }}</p>
    <KeyFingerprint v-else-if="thumbprint" :hex="thumbprint" tone="dark" />
    <p v-else class="m-0 font-mono text-sm text-haze-400">calcolo l’impronta…</p>
  </div>
</template>
