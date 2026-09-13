import { reactive } from 'vue'
import { hybridThumbprint } from '@/src/crypto/fingerprint'
import type { RecipientPublicKeys } from '@/src/crypto/hybrid'
import { useVerifiedKeys, type VerificationState } from '@/src/composables/useVerifiedKeys'

/**
 * Verifica dell'impronta del destinatario, riutilizzabile (roadmap F2).
 *
 * Si interpone tra «ho la chiave pubblica di X» e «ci chiudo dentro la chiave del file»: è
 * l'unico punto in cui l'utente può accorgersi che la chiave servita dal server non è quella
 * della persona giusta. Prima viveva dentro ShareFileModal; ora la usano sia «Condividi» da
 * «I tuoi file» sia «Manda a una persona», con lo stesso dialogo e la stessa memoria delle
 * impronte già verificate.
 *
 * L'impronta copre **tutte** le chiavi su cui si cifra (RSA e, se c'è, X-Wing): se coprisse
 * solo la RSA, il server potrebbe sostituire la chiave post-quantum senza che nessuno se ne
 * accorga. Quando un destinatario aggiunge la chiave post-quantum la sua impronta cambia, e il
 * dialogo lo segnala come chiave cambiata: è corretto, le chiavi su cui si cifra sono cambiate.
 *
 * Uso: `askApproval` va passata come `verifyRecipient` a useShareFile / useSendFiles, e il
 * chiamante monta `<RecipientFingerprintDialog>` legato a `dialog`, con
 * `@confirm="settle(true)"` e `@cancel="settle(false)"`.
 */
export function useRecipientVerification() {
  const { checkRecipient, getVerified } = useVerifiedKeys()

  const dialog = reactive({
    visible: false,
    email: '',
    thumbprint: '',
    state: 'new' as VerificationState,
    verifiedAt: null as string | null,
  })

  let pending: ((approved: boolean) => void) | null = null

  async function askApproval(recipient: RecipientPublicKeys, email: string): Promise<boolean> {
    const thumbprint = await hybridThumbprint(recipient.rsaJwk, recipient.xwing)
    dialog.email = email
    dialog.thumbprint = thumbprint
    dialog.state = await checkRecipient(email, thumbprint)
    dialog.verifiedAt = (await getVerified(email))?.verifiedAt ?? null
    dialog.visible = true
    return new Promise<boolean>((resolve) => { pending = resolve })
  }

  function settle(approved: boolean) {
    dialog.visible = false
    pending?.(approved)
    pending = null
  }

  return { dialog, askApproval, settle }
}
