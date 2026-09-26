import { describe, it, expect, afterEach } from 'vitest'
import { isHandoff, shareableLink, stripHandoffFromAddressBar, withoutHandoff } from './linkHandoff'

// Un IV in base64 standard ha «+», «/» e «=»: se il link venisse ricostruito invece che
// ripulito, sono i primi caratteri a cambiare.
const HASH = '#key=Ab-_cd12Ef34gh56Ij78kl90Mn12op34Qr56st78Uv9&iv=q%2Bw%2Fe%3D%3D'

afterEach(() => window.history.replaceState(null, '', '/'))

describe('linkHandoff', () => {
  it('riconosce il segnale del QR, e solo quello', () => {
    expect(isHandoff(`${HASH}&via=qr`)).toBe(true)
    expect(isHandoff(`#via=qr&${HASH.slice(1)}`)).toBe(true)
    expect(isHandoff(HASH)).toBe(false)
    expect(isHandoff(`${HASH}&via=qrcode`)).toBe(false)
    expect(isHandoff('')).toBe(false)
  })

  it('toglie il segnale lasciando il resto byte per byte identico', () => {
    expect(withoutHandoff(`${HASH}&via=qr`)).toBe(HASH)
    expect(withoutHandoff(`#via=qr&${HASH.slice(1)}`)).toBe(HASH)
    expect(withoutHandoff(HASH)).toBe(HASH)
    expect(withoutHandoff('#via=qr')).toBe('')
    // Un link già decodificato da qualche app («+» e «/» in chiaro): va lasciato com'è.
    // Ricostruito con URLSearchParams, il «+» diventerebbe uno spazio.
    expect(withoutHandoff('#key=abc&iv=q+w/e==&via=qr')).toBe('#key=abc&iv=q+w/e==')
  })

  it('il link da inoltrare: pagina + chiave, senza segnale e senza query', () => {
    const link = shareableLink({ origin: 'https://novren.net', pathname: '/share/tok00000001', hash: `${HASH}&via=qr` })
    expect(link).toBe(`https://novren.net/share/tok00000001${HASH}`)
  })

  it('ripulisce la barra degli indirizzi senza aggiungere voci alla cronologia', () => {
    window.history.replaceState(null, '', `/share/tok00000001${HASH}&via=qr`)
    const entries = window.history.length
    stripHandoffFromAddressBar()
    expect(window.location.pathname).toBe('/share/tok00000001')
    expect(window.location.hash).toBe(HASH)
    expect(window.history.length).toBe(entries)
  })
})
