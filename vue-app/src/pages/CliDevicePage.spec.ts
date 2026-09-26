import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * /cli/device — autorizzare la CLI di un server senza browser con un codice breve.
 */

const { get, post, query } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  query: { value: {} as Record<string, string> },
}))

vi.mock('axios', () => ({ default: { get, post, delete: vi.fn() } }))
vi.mock('js-cookie', () => ({ default: { get: () => undefined } }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: query.value }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/src/composables/useTurnstile', () => ({
  useTurnstile: () => ({ enabled: false, mount: vi.fn(), getToken: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/src/components/landing/PublicShell.vue', () => ({ default: { name: 'PublicShell', template: '<div><slot /></div>' } }))

import CliDevicePage from './CliDevicePage.vue'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  query.value = {}
  sessionStorage.clear()
})

describe('CliDevicePage', () => {
  it('un codice malformato non parte nemmeno verso il server', async () => {
    const wrapper = mount(CliDevicePage)
    await wrapper.get('[data-testid="cli-device-code"]').setValue('ciao')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(get).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('otto caratteri')
  })

  it('codice valido → mostra quale computer chiede, poi approva senza account', async () => {
    get.mockResolvedValue({ data: { deviceName: 'server-ssh' } })
    post.mockResolvedValue({ data: { approved: true } })
    const wrapper = mount(CliDevicePage)
    await wrapper.get('[data-testid="cli-device-code"]').setValue('bcdf ghjk')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(get.mock.calls[0]![0]).toContain('/cli/device/BCDF-GHJK')
    expect(wrapper.text()).toContain('server-ssh')

    await wrapper.get('[data-testid="cli-device"]').trigger('click')
    await flushPromises()
    expect(post.mock.calls[0]![1]).toMatchObject({ userCode: 'BCDF-GHJK', kind: 'device' })
    expect(wrapper.find('[data-testid="cli-done"]').exists()).toBe(true)
  })

  it('il codice nella query si precompila e si cerca da solo', async () => {
    query.value = { code: 'BCDF-GHJK' }
    get.mockResolvedValue({ data: { deviceName: 'server' } })
    const wrapper = mount(CliDevicePage)
    await flushPromises()
    expect(wrapper.find('[data-testid="cli-consent"]').exists()).toBe(true)
  })

  it('codice inesistente o scaduto: lo dice, e resta sul modulo', async () => {
    get.mockRejectedValue({ response: { status: 404, data: { errorCode: 'DEVICE_CODE_INVALID' } } })
    const wrapper = mount(CliDevicePage)
    await wrapper.get('[data-testid="cli-device-code"]').setValue('BCDF-GHJK')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('non valido o scaduto')
    expect(wrapper.find('[data-testid="cli-consent"]').exists()).toBe(false)
  })
})
