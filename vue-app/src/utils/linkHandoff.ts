/**
 * La «consegna» di un link: il mittente inquadra con il telefono il QR mostrato da
 * `novren send`, e questa pagina gli serve per INOLTRARE il link, non per scaricare.
 *
 * Il QR porta un segnale in più nel frammento: `…#key=…&iv=…&via=qr`. Come la chiave, il
 * frammento non arriva mai al server — e infatti il server non sa niente di questa modalità:
 * aprire la pagina legge solo le informazioni pubbliche del link, non registra accessi e non
 * consuma download.
 *
 * ⚠️ Il link che si inoltra è SENZA il segnale. Altrimenti chi lo riceve vedrebbe anche lui
 * «inoltra», invece della pagina per scaricare.
 */

export const HANDOFF_PARAM = 'via'
export const HANDOFF_VALUE = 'qr'

const parts = (hash: string) => hash.replace(/^#/, '').split('&').filter(Boolean)
const isHandoffPart = (part: string) => part === `${HANDOFF_PARAM}=${HANDOFF_VALUE}`

/** Il frammento chiede la modalità consegna? */
export function isHandoff(hash: string): boolean {
  return parts(hash).some(isHandoffPart)
}

/**
 * Il frammento senza il segnale, **byte per byte uguale** per il resto. Si toglie a pezzi
 * invece di ricostruirlo con URLSearchParams: quello ricodificherebbe la chiave (`+`, `/`,
 * `=` dell'IV in base64) e il link inoltrato sarebbe diverso da quello generato — equivalente
 * per chi lo decodifica bene, ma non c'è motivo di scommetterci.
 */
export function withoutHandoff(hash: string): string {
  const kept = parts(hash).filter((part) => !isHandoffPart(part))
  return kept.length ? `#${kept.join('&')}` : ''
}

/** Il link da inoltrare: pagina + frammento ripulito. Niente query, niente altro. */
export function shareableLink(location: Pick<Location, 'origin' | 'pathname' | 'hash'>): string {
  return `${location.origin}${location.pathname}${withoutHandoff(location.hash)}`
}

/**
 * Toglie il segnale anche dalla barra degli indirizzi (senza ricaricare né aggiungere una voce
 * alla cronologia): chi copia l'indirizzo a mano copia comunque il link pulito.
 */
export function stripHandoffFromAddressBar(): void {
  const { pathname, search, hash } = window.location
  window.history.replaceState(window.history.state, '', `${pathname}${search}${withoutHandoff(hash)}`)
}
