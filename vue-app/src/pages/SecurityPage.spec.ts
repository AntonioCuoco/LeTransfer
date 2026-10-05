import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

/**
 * Pagina sicurezza.
 *
 * Cosa difende: che la pagina dica lo **stato vero** (ricontrollato il 2026-10-05). Un prodotto
 * che vende fiducia non può avere una pagina sicurezza indietro di mesi: prima diceva
 * «post-quantum: in roadmap» con il post-quantum già in produzione, e «client open-source» con
 * il repository privato. Il primo errore toglie un merito, il secondo promette una cosa falsa.
 */

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/src/composables/useMotion', () => ({ usePageEnter: () => ({ root: { value: null } }) }))

import SecurityPage from './SecurityPage.vue'

const text = () => mount(SecurityPage, { global: { stubs: { PublicShell: { template: '<div><slot /></div>' } } } }).text()

describe('SecurityPage', () => {
  it('il post-quantum è in produzione, non in roadmap', () => {
    expect(text()).not.toContain('in roadmap')
    expect(text()).toContain('sì · chiavi tra utenti')
  })

  it('non si dice open-source finché il sorgente non è pubblico', () => {
    expect(text()).not.toMatch(/open-source/i)
    expect(text()).toMatch(/Codice sorgente pubblico\s*non ancora/)
  })

  it('dice anche da cosa non protegge, compresi i limiti del post-quantum', () => {
    const page = text()
    expect(page).toContain('Da cosa non ti protegge')
    expect(page).toContain('Chi ha il link, ha il file')
    expect(page).toContain('I limiti del post-quantum')
  })

  it('il nome del file è tra le cose cifrate', () => {
    expect(text()).toContain('Nomi dei file cifrati')
  })
})
