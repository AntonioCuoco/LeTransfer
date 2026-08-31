import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import Cookies from 'js-cookie'
import { wipeLocalData } from './useAccountDeletion'

/**
 * La pulizia locale è l'ultimo atto della cancellazione, e l'unico interamente nostro:
 * il server può aver dimenticato l'account, ma la **chiave privata RSA** vive solo qui,
 * nell'IndexedDB di questo browser. Se resta, resta l'unico residuo utilizzabile di un
 * account che non esiste più.
 *
 * Questi test esistono soprattutto per il caso storto: uno storage che rifiuta, o un
 * IndexedDB tenuto aperto da un'altra scheda, non devono impedire il resto della pulizia.
 */

describe('wipeLocalData', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  /**
   * `happy-dom` non fornisce `indexedDB`, quindi va messo noi. Non è una scorciatoia: il
   * codice di produzione deve reggere **anche** quando il globale non c'è (browser in
   * navigazione privata che lo negano), e infatti la chiamata vive dentro un `try`.
   */
  function stubIndexedDB(behaviour: 'success' | 'blocked') {
    const deleteDatabase = vi.fn(() => {
      const request: Record<string, (() => void) | null> = {
        onsuccess: null,
        onerror: null,
        onblocked: null,
      }
      queueMicrotask(() => {
        if (behaviour === 'success') request.onsuccess?.()
        else request.onblocked?.()
      })
      return request
    })
    vi.stubGlobal('indexedDB', { deleteDatabase })
    return deleteDatabase
  }

  it('cancella le chiavi dell app da localStorage e sessionStorage', async () => {
    localStorage.setItem('letransfer_user_settings', '{}')
    localStorage.setItem('letransfer_verified_keys', '[]')
    localStorage.setItem('letransfer_downloads_seen', '{}')
    localStorage.setItem('theme', 'dark')
    sessionStorage.setItem('letransfer_pending_claim', '{}')
    sessionStorage.setItem('pkce_verifier', 'abc')

    await wipeLocalData()

    expect(localStorage.getItem('letransfer_user_settings')).toBeNull()
    expect(localStorage.getItem('letransfer_verified_keys')).toBeNull()
    expect(localStorage.getItem('letransfer_downloads_seen')).toBeNull()
    expect(localStorage.getItem('theme')).toBeNull()
    expect(sessionStorage.getItem('letransfer_pending_claim')).toBeNull()
    expect(sessionStorage.getItem('pkce_verifier')).toBeNull()
  })

  it('non tocca le chiavi che non sono nostre', async () => {
    localStorage.setItem('qualcosa_di_un_altro', 'resta')

    await wipeLocalData()

    // `localStorage.clear()` sarebbe stato più corto e avrebbe cancellato roba altrui:
    // l'elenco esplicito serve esattamente a questo.
    expect(localStorage.getItem('qualcosa_di_un_altro')).toBe('resta')
  })

  it('rimuove i cookie di autenticazione', async () => {
    const remove = vi.spyOn(Cookies, 'remove')

    await wipeLocalData()

    expect(remove).toHaveBeenCalledWith('accessToken')
    expect(remove).toHaveBeenCalledWith('idToken')
    expect(remove).toHaveBeenCalledWith('refreshToken')
  })

  it('cancella il database che contiene la chiave privata', async () => {
    const deleteDatabase = stubIndexedDB('success')

    await wipeLocalData()

    // Il nome è l'unica cosa che, se sbagliata, lascia la chiave privata al suo posto
    // senza che nulla lo segnali.
    expect(deleteDatabase).toHaveBeenCalledWith('letransfer-keys')
  })

  it('completa la pulizia anche se IndexedDB resta bloccato da un altra scheda', async () => {
    // Caso reale: un'altra scheda tiene il DB aperto, quindi arriva solo `blocked` e mai
    // `success`. Senza la gestione di quell'evento la promise non si risolverebbe e la
    // pulizia si fermerebbe qui, lasciando cookie e storage al loro posto.
    stubIndexedDB('blocked')
    localStorage.setItem('letransfer_user_settings', '{}')

    await wipeLocalData()

    expect(localStorage.getItem('letransfer_user_settings')).toBeNull()
  })

  it('non si ferma se il browser nega del tutto IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined)
    localStorage.setItem('letransfer_user_settings', '{}')

    await expect(wipeLocalData()).resolves.toBeUndefined()
    expect(localStorage.getItem('letransfer_user_settings')).toBeNull()
  })

  it('completa la pulizia anche se lo storage rifiuta la scrittura', async () => {
    const remove = vi.spyOn(Cookies, 'remove')
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage negato')
    })

    await expect(wipeLocalData()).resolves.toBeUndefined()
    expect(remove).toHaveBeenCalled()
  })
})
