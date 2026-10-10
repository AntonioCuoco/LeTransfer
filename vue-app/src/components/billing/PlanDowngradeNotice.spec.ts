import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * Da Pro a Free: avviso e scelta dei file da tenere.
 *
 * Cosa difende: che chi è tornato a Free **veda** la scadenza (avviso fisso, modale che si apre
 * da sola finché non ha scelto), che parta dalla proposta del server (i più recenti che stanno
 * nei 10 GB) e che non possa salvare una scelta oltre lo spazio del Free.
 */

const GiB = 1024 ** 3

const { get, put, push } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), push: vi.fn() }))
vi.mock('axios', () => ({ default: { get, put, post: vi.fn() } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/src/utils/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))
vi.mock('@/src/composables/useSecurityPrompt', () => ({ useSecurityPrompt: () => ({ requestUnlock: vi.fn() }) }))
vi.mock('@/src/composables/useBilling', () => ({ useBilling: () => ({ startCheckout: vi.fn() }) }))

const stubs = {
  Dialog: { props: ['visible'], template: '<div v-if="visible" role="dialog"><slot /><slot name="footer" /></div>' },
  Button: {
    props: ['label', 'disabled'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
  },
}

const file = (n: number, gb: number) => ({
  s3Key: `uploads/files/sub/k${n}`,
  fileName: `file-${n}.mov`,
  nameVersion: null,
  fileType: 'video/mp4',
  uploadedAt: `2026-10-0${n}T10:00:00.000Z`,
  bytes: gb * GiB,
})

function downgrade(extra: Record<string, unknown> = {}) {
  return {
    status: 'pending',
    fromPlan: 'pro',
    endedAt: '2026-10-07T00:00:00.000Z',
    graceEndsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    keepChosenAt: null,
    keepLimitBytes: 10 * GiB,
    keep: ['uploads/files/sub/k1', 'uploads/files/sub/k3'],
    chosen: false,
    files: [file(1, 6), file(2, 6), file(3, 3)],
    ...extra,
  }
}

async function mountNotice() {
  // Import dopo i mock: il composable tiene lo stato a livello di modulo.
  vi.resetModules()
  const { default: PlanDowngradeNotice } = await import('./PlanDowngradeNotice.vue')
  const wrapper = mount(PlanDowngradeNotice, { global: { stubs } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  get.mockReset()
  put.mockReset()
  sessionStorage.clear()
})

describe('PlanDowngradeNotice', () => {
  it('senza un passaggio in corso non mostra niente', async () => {
    get.mockResolvedValue({ data: { data: { downgrade: null } } })
    const wrapper = await mountNotice()

    expect(wrapper.find('[data-testid="downgrade-banner"]').exists()).toBe(false)
  })

  it('se non hai ancora scelto, la modale si apre da sola con la proposta dei più recenti', async () => {
    get.mockResolvedValue({ data: { data: { downgrade: downgrade() } } })
    const wrapper = await mountNotice()

    expect(wrapper.find('[data-testid="downgrade-dialog"]').exists()).toBe(true)
    const checked = wrapper.findAll('input[type="checkbox"]').map((i) => (i.element as HTMLInputElement).checked)
    expect(checked).toEqual([true, false, true])
    expect(wrapper.text()).toContain('Tieni 2 file · 9 GB di 10 GB')
  })

  it('se hai già scelto, resta l\'avviso ma la modale non si apre da sola', async () => {
    get.mockResolvedValue({ data: { data: { downgrade: downgrade({ chosen: true }) } } })
    const wrapper = await mountNotice()

    expect(wrapper.find('[data-testid="downgrade-banner"]').text()).toContain('Hai scelto i file da tenere')
    expect(wrapper.find('[data-testid="downgrade-dialog"]').exists()).toBe(false)
  })

  it('oltre i 10 GB non si salva', async () => {
    get.mockResolvedValue({ data: { data: { downgrade: downgrade() } } })
    const wrapper = await mountNotice()

    await wrapper.findAll('input[type="checkbox"]')[1].trigger('change') // + 6 GB → 15 GB

    expect(wrapper.text()).toContain('Hai scelto più dello spazio del Free')
    const save = wrapper.findAll('button').find((b) => b.text() === 'Salva la scelta')!
    expect(save.attributes('disabled')).toBeDefined()
  })

  it('salva la scelta così com\'è', async () => {
    get.mockResolvedValue({ data: { data: { downgrade: downgrade() } } })
    put.mockResolvedValue({ data: { success: true } })
    const wrapper = await mountNotice()

    await wrapper.findAll('button').find((b) => b.text() === 'Salva la scelta')!.trigger('click')
    await flushPromises()

    expect(put).toHaveBeenCalledWith(expect.stringContaining('/user/downgrade/keep'), { s3Keys: ['uploads/files/sub/k1', 'uploads/files/sub/k3'] })
  })
})
