import {
  generateXWingSeed,
  xwingPublicKeyFromSeed,
  xwingPublicKeyToBase64,
  xwingPublicKeyFromBase64,
  wrapXWingSeedWithMasterKey,
  unwrapXWingSeedWithMasterKey,
  type XWingSeedBackup,
} from './hybrid'

/**
 * Allineamento della chiave X-Wing di un utente fra questo dispositivo e il server (O2.3).
 *
 * Le regole sono poche, ma sbagliarne una fa perdere file **già ricevuti**, senza errori:
 *
 *  1. **Prima si ripristina, poi si genera.** Se l'account ha già una chiave X-Wing, questo
 *     dispositivo usa quella (dal backup). Generarne una nuova la farebbe convivere con la
 *     vecchia, e i file cifrati per la vecchia non si aprirebbero qui.
 *  2. **Mai una chiave pubblica senza il backup del seme.** Chiave e backup viaggiano nella
 *     stessa richiesta; il server li salva insieme o per niente.
 *  3. **Il seme si salva in locale prima di pubblicare.** Se la pagina si chiude dopo la
 *     pubblicazione, il seme c'è comunque (anche nel backup).
 *  4. **Due dispositivi insieme: vince il primo.** Il secondo riceve «esiste già» e ripristina
 *     la chiave del primo.
 *
 * Rete e storage arrivano come dipendenze: la cartella crypto non fa chiamate di rete, e le
 * regole si verificano in `xwingKeySync.test.ts` senza server né browser.
 */

/** Quello che il server conserva: la chiave pubblica e il backup cifrato del seme. */
export interface PublishedXWingKey extends XWingSeedBackup {
  xwingPublicKey: string
}

export interface XWingKeySyncDeps {
  masterKey: CryptoKey
  loadLocalSeed: () => Promise<Uint8Array | null>
  saveLocalSeed: (seed: Uint8Array) => Promise<void>
  /** `null` = l'account non ha ancora una chiave X-Wing. Qualunque altro problema: eccezione. */
  fetchPublished: () => Promise<PublishedXWingKey | null>
  /** `'exists'` = nel frattempo un altro dispositivo ne ha pubblicata una diversa. */
  publish: (key: PublishedXWingKey) => Promise<'published' | 'exists'>
}

export interface XWingKeyPair {
  seed: Uint8Array
  publicKey: Uint8Array
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && a.every((byte, i) => byte === b[i])
}

export async function syncXWingKey(deps: XWingKeySyncDeps): Promise<XWingKeyPair> {
  // Due giri al massimo: il secondo serve solo se un altro dispositivo ha pubblicato nel mezzo.
  for (let round = 0; round < 2; round++) {
    const local = await deps.loadLocalSeed()
    const published = await deps.fetchPublished()

    if (published) {
      const publishedKey = xwingPublicKeyFromBase64(published.xwingPublicKey)
      if (local && sameBytes(await xwingPublicKeyFromSeed(local), publishedKey)) {
        return { seed: local, publicKey: publishedKey }
      }
      const seed = await unwrapXWingSeedWithMasterKey(published, deps.masterKey)
      // Un backup che non corrisponde alla chiave pubblicata non si salva: aprirebbe altri file, non questi.
      if (!sameBytes(await xwingPublicKeyFromSeed(seed), publishedKey)) {
        throw new Error('Il backup della tua chiave post-quantum non corrisponde alla chiave pubblicata.')
      }
      await deps.saveLocalSeed(seed)
      return { seed, publicKey: publishedKey }
    }

    // Nessuna chiave sul server. Un seme locale c'è solo se una pubblicazione precedente non è
    // arrivata: nessuno ha cifrato per lui, quindi si riusa invece di generarne un altro.
    const seed = local ?? generateXWingSeed()
    const publicKey = await xwingPublicKeyFromSeed(seed)
    const backup = await wrapXWingSeedWithMasterKey(seed, deps.masterKey)
    if (!local) await deps.saveLocalSeed(seed)

    const outcome = await deps.publish({ xwingPublicKey: xwingPublicKeyToBase64(publicKey), ...backup })
    if (outcome === 'published') return { seed, publicKey }
  }
  throw new Error('La tua chiave post-quantum è cambiata durante la sincronizzazione: ricarica la pagina e riprova.')
}
