import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import QrCode from './QrCode.vue'

/**
 * Il codificatore ha già i suoi test (`utils/qr.test.ts`, confrontati con
 * un'implementazione indipendente). Qui si verifica solo il contorno: che il disegno
 * abbia il **margine chiaro** richiesto dalla specifica, e che un valore che non entra
 * in un QR non faccia cadere la pagina.
 */

describe('QrCode', () => {
  it('disegna il codice con il margine chiaro di 4 moduli per lato', () => {
    const wrapper = mount(QrCode, { props: { value: 'https://letransfer.app/share/abc#key=x' } })
    const svg = wrapper.get('svg')

    // v3 = 29 moduli, + 4 di margine per lato = 37. Senza quel margine molti lettori
    // non trovano i mirini e il codice semplicemente non si legge.
    expect(svg.attributes('viewBox')).toBe('0 0 37 37')
    expect(wrapper.get('path').attributes('d')).toMatch(/^M\d+ \d+h1v1h-1z/)
  })

  it('rispetta la dimensione e l’etichetta accessibile richieste', () => {
    const wrapper = mount(QrCode, {
      props: { value: 'ciao', size: 240, label: 'Codice QR del link di download' },
    })
    const svg = wrapper.get('svg')

    expect(svg.attributes('width')).toBe('240')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('Codice QR del link di download')
  })

  it('non disegna nulla, invece di rompersi, se il contenuto non entra in un QR', () => {
    // Oltre 2331 caratteri non esiste una versione capace di contenerli: chi invia ha
    // comunque il link testuale, che è la via principale.
    const wrapper = mount(QrCode, { props: { value: 'x'.repeat(2400) } })
    expect(wrapper.find('svg').exists()).toBe(false)
  })
})
