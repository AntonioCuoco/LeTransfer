<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import KeyFingerprint from '@/src/components/ui/KeyFingerprint.vue'
import { useUserKeyPair } from '@/src/composables/useUserKeyPair'
import { hybridThumbprint } from '@/src/crypto/fingerprint'

/**
 * La MIA impronta (roadmap F2).
 *
 * Senza questa schermata la verifica del destinatario è monca: chi condivide vede
 * l'impronta dell'altro, ma l'altro non ha modo di leggere la propria per confermarla.
 * È la metà mancante della stessa funzione, non un vezzo da pagina impostazioni.
 *
 * Copre le stesse chiavi dell'impronta che vede chi ci manda file: RSA e X-Wing. La chiave
 * X-Wing è quella di QUESTO dispositivo, mai quella dichiarata dal server — altrimenti una
 * chiave sostituita dal server risulterebbe «confermata» proprio da qui.
 */

const { publicKey, xwingPublicKey, exportPublicKeyJWK, initializeKeyPair } = useUserKeyPair()

const thumbprint = ref('')
const error = ref('')

async function computeThumbprint() {
  try {
    const jwk = await exportPublicKeyJWK()
    if (!jwk) return
    thumbprint.value = await hybridThumbprint(jwk, xwingPublicKey.value)
    error.value = ''
  } catch {
    error.value = 'Impossibile calcolare l’impronta della tua chiave.'
  }
}

watch([publicKey, xwingPublicKey], computeThumbprint, { immediate: true })

onMounted(async () => {
  if (!publicKey.value) await initializeKeyPair()
  if (!publicKey.value) error.value = 'Chiavi non ancora disponibili su questo dispositivo.'
})
</script>

<template>
  <div class="rounded-panel border border-shell-700 bg-shell-800 p-5">
    <h3 class="m-0 mb-1 text-lg font-semibold text-white">La tua impronta</h3>
    <p class="mb-4 mt-0 max-w-[62ch] text-sm leading-relaxed text-haze-300">
      È il riassunto delle tue chiavi pubbliche. Quando qualcuno sta per mandarti un file cifrato,
      il suo schermo mostra queste stesse coppie: leggetevele a voce e saprete che nessuno si è
      messo in mezzo. Non è un segreto — puoi pubblicarla ovunque.
    </p>

    <p v-if="error" class="m-0 text-sm text-warn-400">{{ error }}</p>
    <template v-else-if="thumbprint">
      <KeyFingerprint :hex="thumbprint" tone="dark" />
      <p v-if="!xwingPublicKey" class="mb-0 mt-3 max-w-[62ch] text-sm leading-relaxed text-haze-400">
        Su questo dispositivo la tua chiave post-quantum non è ancora pronta: l’impronta qui sopra
        copre solo la chiave RSA. Sblocca le tue chiavi con le 24 parole per completarla.
      </p>
    </template>
    <p v-else class="m-0 font-mono text-sm text-haze-400">calcolo l’impronta…</p>
  </div>
</template>
