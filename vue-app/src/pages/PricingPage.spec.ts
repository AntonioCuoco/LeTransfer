import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

/**
 * Pagina prezzi.
 *
 * Cosa difende: che la pagina dica la scala vera (ospite → Free → Pro, 2026-10-05) e niente di
 * più. Chi legge sta decidendo se pagare: un numero vecchio o una funzione «solo Pro» che in
 * realtà hanno tutti sono promesse che il prodotto non mantiene.
 */

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/src/composables/useMotion', () => ({ usePageEnter: () => ({ root: { value: null } }) }))
vi.mock('@/src/utils/registration', () => ({ REGISTRATION_OPEN: true, REGISTRATION_CLOSED_MESSAGE: 'chiuso' }))

import PricingPage from './PricingPage.vue'

function mountPage() {
  return mount(PricingPage, { global: { stubs: { PublicShell: { template: '<div><slot /></div>' } } } })
}

function card(wrapper: ReturnType<typeof mountPage>, name: string) {
  return wrapper.findAll('h2').find((h) => h.text() === name)!.element.closest('div.flex.flex-col') as HTMLElement
}

beforeEach(() => push.mockClear())

describe('PricingPage', () => {
  it('non dice più che gli importi sono provvisori', () => {
    expect(mountPage().text()).not.toContain('provvisori')
  })

  it('il Free mostra la scala nuova: 5 GB per file, 50 GB al mese, 10 GB di spazio', () => {
    const text = card(mountPage(), 'Free').textContent!

    expect(text).toContain('5 GB')
    expect(text).toContain('50 GB')
    expect(text).toContain('10 GB')
    expect(text).not.toContain('Invio senza account')
  })

  it('il Pro non promette come esclusive funzioni che hanno tutti gli account', () => {
    const text = card(mountPage(), 'Pro').textContent!

    expect(text).toContain('Tutto di Free')
    expect(text).not.toContain('Notifiche al download')
    expect(text).not.toContain('Storico e gestione dei link')
  })

  it('il Free è un account: porta alla registrazione; l\'invio al volo ha la sua riga', async () => {
    const wrapper = mountPage()

    await wrapper.findAll('button').find((b) => b.text() === 'Crea un account gratis')!.trigger('click')
    expect(push).toHaveBeenLastCalledWith('/register')

    expect(wrapper.get('[data-testid="guest-entry"]').text()).toContain('Fino a 1 GB anche senza account')
    await wrapper.get('[data-testid="guest-entry"] button').trigger('click')
    expect(push).toHaveBeenLastCalledWith('/')
  })
})
