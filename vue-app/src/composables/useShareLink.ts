import { useEncryptionStore } from '@/src/stores/encryption'
import { createKeyHash } from '@/src/crypto/crypto'
import type { SharedLink } from '@/src/types'

/**
 * Ricostruzione del link completo di chiave — **un posto solo**.
 *
 * Per un file cifrato la chiave vive nel frammento `#key=…&iv=…`, che nasce lato
 * client nell'istante in cui il link viene creato. Il record salvato dal server ha
 * un `url` **senza** frammento, ed è giusto così: il server la chiave non la vede
 * mai. Ma dopo un ricaricamento la tabella si ripopola da quel record, e chi copia
 * quell'URL consegna ciphertext inservibile.
 *
 * Il frammento va quindi ricostruito dal vault locale. Questa funzione esiste perché
 * quella conoscenza stava dentro un handler di "copia": ogni nuovo modo di consegnare
 * un link (il QR, per esempio) avrebbe dovuto reimparare la stessa regola, e sarebbe
 * bastato dimenticarne un pezzo per rimettere in giro link rotti. Un QR sbagliato è
 * peggio di una copia sbagliata: non lo leggi, lo inquadri e ti fidi.
 *
 * Quando la chiave non è disponibile **non si ripiega sull'URL monco**: si spiega
 * perché. Meglio un errore chiaro che un link muto che fallisce a casa d'altri.
 */

export type ResolvedShareLink =
  | { ok: true; url: string }
  | { ok: false; reason: 'locked' | 'missing-key'; message: string }

const MESSAGES = {
  locked: 'Sblocca prima le chiavi: senza, il link sarebbe privo della chiave e quindi inservibile.',
  missing: 'La chiave di questo file non è su questo dispositivo: il link non si può ricostruire. Rigeneralo da dove hai caricato il file.',
} as const

export function useShareLink() {
  const encryptionStore = useEncryptionStore()

  const frontendUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin

  async function resolveShareUrl(link: SharedLink): Promise<ResolvedShareLink> {
    // Link non cifrato: l'URL del server è già completo.
    if (!link.isEncrypted) return { ok: true, url: link.url }

    if (!encryptionStore.isUnlocked) {
      return { ok: false, reason: 'locked', message: MESSAGES.locked }
    }

    const keyData = await encryptionStore.getKey(link.s3Key)
    if (!keyData) {
      return { ok: false, reason: 'missing-key', message: MESSAGES.missing }
    }

    return { ok: true, url: `${frontendUrl}/share/${link.publicToken}${createKeyHash(keyData)}` }
  }

  return { resolveShareUrl }
}
