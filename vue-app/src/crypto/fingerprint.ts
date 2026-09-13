/**
 * Impronta di una chiave pubblica (roadmap F0.3 + F2).
 *
 * Usa il **JWK Thumbprint (RFC 7638)**: SHA-256 sul JSON canonico dei soli membri
 * obbligatori, in ordine lessicografico. La canonicalizzazione non è un dettaglio —
 * è ciò che rende l'impronta riproducibile: due client che serializzano la stessa
 * chiave in ordine diverso otterrebbero digest diversi, e la verifica out-of-band
 * («leggimi le prime quattro coppie al telefono») non funzionerebbe più.
 *
 * Per RSA i membri canonici sono esattamente: e, kty, n.
 */

/** JSON canonico RFC 7638 per una chiave RSA. */
function canonicalJwk(jwk: JsonWebKey): string {
  if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
    throw new Error('Impronta supportata solo per chiavi RSA (kty/n/e mancanti)')
  }
  // Ordine lessicografico dei membri, nessuno spazio: lo impone la RFC.
  return `{"e":"${jwk.e}","kty":"RSA","n":"${jwk.n}"}`
}

/** Impronta SHA-256 in esadecimale minuscolo (64 caratteri). */
export async function jwkThumbprint(jwk: JsonWebKey): Promise<string> {
  const data = new TextEncoder().encode(canonicalJwk(jwk))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Impronta di una CryptoKey pubblica già importata. */
export async function keyThumbprint(publicKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey)
  return jwkThumbprint(jwk)
}

/**
 * Impronta di un destinatario con chiave **ibrida** (RSA + X-Wing, formato v2 del wrap).
 *
 * Deve impegnare ENTRAMBE le chiavi: se coprisse solo la RSA, chi controlla il server potrebbe
 * sostituire la chiave X-Wing senza che l'impronta cambi — e con la X-Wing sostituita la
 * protezione post-quantum di quel destinatario sarebbe vuota.
 *
 *   SHA-256( {"rsa":"<RFC 7638 della RSA, hex>","xwing":"<SHA-256 della chiave X-Wing, hex>"} )
 *
 * JSON canonico (chiavi in ordine, nessuno spazio) come in RFC 7638, per la stessa ragione:
 * due client indipendenti devono ottenere lo stesso digest. Senza chiave X-Wing l'impronta è
 * quella RFC 7638 di sempre, così un destinatario che non ha ancora la chiave nuova non
 * risulta «cambiato».
 */
export async function hybridThumbprint(rsaJwk: JsonWebKey, xwingPublicKey: Uint8Array | null): Promise<string> {
  const rsa = await jwkThumbprint(rsaJwk)
  if (!xwingPublicKey) return rsa
  const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const xwing = toHex(await crypto.subtle.digest('SHA-256', xwingPublicKey.slice()))
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`{"rsa":"${rsa}","xwing":"${xwing}"}`)))
}

/** "a3f1…" → ["A3","F1",…]: coppie maiuscole, il formato che si legge a voce. */
export function fingerprintGroups(hex: string): string[] {
  return (hex.match(/.{2}/g) ?? []).map((pair) => pair.toUpperCase())
}

/** Forma compatta per i log e i confronti rapidi: "A3:F1:9C:2D". */
export function shortFingerprint(hex: string, groups = 4): string {
  return fingerprintGroups(hex).slice(0, groups).join(':')
}
