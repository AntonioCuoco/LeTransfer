import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * La sezione dei dispositivi collegati alla CLI, nelle impostazioni.
 *
 * Cosa difende soprattutto: che con la funzione spenta sul backend (404) la sezione **non
 * compaia**. Il sito si pubblica prima dell'accensione: un riquadro vuoto o in errore nelle
 * impostazioni di tutti gli utenti sarebbe il primo effetto visibile di una funzione che
 * nessuno può ancora usare.
 */

const { get, del } = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn() }))
vi.mock('axios', () => ({ default: { get, post: vi.fn(), delete: del } }))
vi.mock('@/src/utils/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() } }))

import CliDevicesSection from './CliDevicesSection.vue'

const device = {
  tokenId: 'abc123',
  deviceName: 'portatile',
  createdAt: '2026-09-01T10:00:00.000Z',
  expiresAt: '2026-11-30T10:00:00.000Z',
  lastUsedAt: '2026-09-20T10:00:00.000Z',
  suspended: false,
}

beforeEach(() => {
  get.mockReset()
  del.mockReset()
})

describe('CliDevicesSection', () => {
  it('funzione spenta (404): non compare niente', async () => {
    get.mockRejectedValue({ response: { status: 404 } })
    const wrapper = mount(CliDevicesSection)
    await flushPromises()
    expect(wrapper.find('[data-testid="cli-devices"]').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('elenca i dispositivi e li scollega', async () => {
    get.mockResolvedValue({ data: { tokens: [device] } })
    del.mockResolvedValue({})
    const wrapper = mount(CliDevicesSection)
    await flushPromises()
    expect(wrapper.text()).toContain('portatile')

    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(del.mock.calls[0]![0]).toContain('/cli/tokens/abc123')
    expect(wrapper.text()).not.toContain('portatile')
  })

  it('nessun dispositivo: spiega come collegarne uno', async () => {
    get.mockResolvedValue({ data: { tokens: [] } })
    const wrapper = mount(CliDevicesSection)
    await flushPromises()
    expect(wrapper.text()).toContain('novren login')
  })
})
