import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * /cli/authorize — la pagina che rilascia un accesso di 90 giorni a un altro computer.
 *
 * Cosa difende: che il codice torni **solo** a 127.0.0.1 e alla porta chiesta dalla CLI; che
 * senza parametri validi non si possa autorizzare niente; che «senza account» passi dalla via
 * anonima (niente sessione) e «account» da quella con la sessione; che con la funzione spenta
 * sul backend la pagina lo dica invece di mostrare un errore.
 */

const { post, cookie, assign, query } = vi.hoisted(() => ({
  post: vi.fn(),
  cookie: { value: undefined as string | undefined },
  assign: vi.fn(),
  query: { value: {} as Record<string, string> },
}))

vi.mock('axios', () => ({ default: { post, get: vi.fn(), delete: vi.fn() } }))
vi.mock('js-cookie', () => ({ default: { get: () => cookie.value } }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: query.value }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/src/composables/useTurnstile', () => ({
  useTurnstile: () => ({ enabled: false, mount: vi.fn(), getToken: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/src/components/landing/PublicShell.vue', () => ({ default: { name: 'PublicShell', template: '<div><slot /></div>' } }))

import CliAuthorizePage from './CliAuthorizePage.vue'

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
const VALID = { port: '49152', state: 'abcdefghijklmnop1234', challenge: CHALLENGE, device: 'portatile' }

beforeEach(() => {
  post.mockReset()
  assign.mockReset()
  cookie.value = undefined
  query.value = {}
  sessionStorage.clear()
  Object.defineProperty(window, 'location', { value: { ...window.location, assign }, writable: true })
})

describe('CliAuthorizePage', () => {
  it('senza parametri validi non si autorizza niente', async () => {
    query.value = { port: '80', state: 'x', challenge: 'y' }
    const wrapper = mount(CliAuthorizePage)
    await flushPromises()
    expect(wrapper.find('[data-testid="cli-invalid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="cli-consent"]').exists()).toBe(false)
  })

  it('mostra il dispositivo e il codice di controllo da confrontare col terminale', async () => {
    query.value = VALID
    const wrapper = mount(CliAuthorizePage)
    await flushPromises()
    expect(wrapper.text()).toContain('portatile')
    expect(wrapper.get('[data-testid="cli-verification"]').text()).toBe('E9Me-lhoa')
  })

  it('«senza account»: via anonima, e il codice torna SOLO a 127.0.0.1 sulla porta chiesta', async () => {
    query.value = VALID
    post.mockResolvedValue({ data: { code: 'codice-monouso' } })
    const wrapper = mount(CliAuthorizePage)
    await flushPromises()

    await wrapper.get('[data-testid="cli-device"]').trigger('click')
    await flushPromises()

    const [, body, config] = post.mock.calls[0]!
    expect(body).toMatchObject({ kind: 'device', codeChallenge: CHALLENGE, deviceName: 'portatile' })
    expect(config).toEqual({ skipAuth: true })

    const target = new URL(assign.mock.calls[0]![0])
    expect(target.hostname).toBe('127.0.0.1')
    expect(target.port).toBe('49152')
    expect(target.searchParams.get('code')).toBe('codice-monouso')
    expect(target.searchParams.get('state')).toBe('abcdefghijklmnop1234')
  })

  it('con la sessione del sito: «collega al mio account», con la sessione', async () => {
    query.value = VALID
    cookie.value = 'jwt-di-sessione'
    post.mockResolvedValue({ data: { code: 'c' } })
    const wrapper = mount(CliAuthorizePage)
    await flushPromises()

    await wrapper.get('[data-testid="cli-account"]').trigger('click')
    await flushPromises()

    const [, body, config] = post.mock.calls[0]!
    expect(body).toMatchObject({ kind: 'account' })
    expect(config).toEqual({ skipAuth: false })
  })

  it('senza sessione propone l’accesso, non il collegamento all’account', async () => {
    query.value = VALID
    const wrapper = mount(CliAuthorizePage)
    await flushPromises()
    expect(wrapper.find('[data-testid="cli-login"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="cli-account"]').exists()).toBe(false)
  })

  it('di ritorno dal login ritrova la richiesta, senza ricominciare dal terminale', async () => {
    query.value = VALID
    mount(CliAuthorizePage)
    await flushPromises()

    query.value = {}
    const back = mount(CliAuthorizePage)
    await flushPromises()
    expect(back.find('[data-testid="cli-consent"]').exists()).toBe(true)
    expect(back.text()).toContain('portatile')
  })

  it('funzione spenta sul backend (404): «non ancora disponibile», non un errore', async () => {
    query.value = VALID
    post.mockRejectedValue({ response: { status: 404 } })
    const wrapper = mount(CliAuthorizePage)
    await flushPromises()
    await wrapper.get('[data-testid="cli-device"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="cli-unavailable"]').exists()).toBe(true)
    expect(assign).not.toHaveBeenCalled()
  })
})
