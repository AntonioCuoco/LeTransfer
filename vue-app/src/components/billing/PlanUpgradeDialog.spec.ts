import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * Da Free a Pro: la proposta di rendere permanenti i file caricati da Free.
 *
 * Cosa difende: l'ordine dei passi per ogni file — **prima** la chiave salvata per la posizione
 * nuova, **poi** lo spostamento (al contrario il file spostato non si aprirebbe più) — e che la
 * modale compaia solo a chi è Pro e ha file free, e non torni dopo «lasciali scadere».
 */

const { get, post, requestUnlock, storeKey, getKey, unlocked, ordine } = vi.hoisted(() => {
  const ordine: string[] = []
  return {
    ordine,
    get: vi.fn(),
    post: vi.fn(async (_url: string, body: { s3Key: string }) => { ordine.push(`promote ${body.s3Key}`); return { data: { success: true } } }),
    requestUnlock: vi.fn(),
    storeKey: vi.fn(async (s3Key: string) => { ordine.push(`chiave ${s3Key}`); return true }),
    getKey: vi.fn(async () => ({ key: 'AAAA', iv: 'BBBB' })),
    unlocked: { value: true },
  }
})

vi.mock('axios', () => ({ default: { get, post } }))
vi.mock('@/src/utils/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))
vi.mock('@/src/composables/useSecurityPrompt', () => ({ useSecurityPrompt: () => ({ requestUnlock }) }))
vi.mock('@/src/utils/getCurrentUser', () => ({ getCurrentUser: () => ({ sub: 'sub-1' }) }))
vi.mock('@/src/stores/encryption', () => ({
  useEncryptionStore: () => ({
    get isUnlocked() { return unlocked.value },
    getKey,
    storeKey,
  }),
}))

const stubs = {
  Dialog: { props: ['visible'], template: '<div v-if="visible" role="dialog"><slot /><slot name="footer" /></div>' },
  Button: {
    props: ['label', 'disabled'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
  },
}

const freeFile = (n: number) => ({
  s3Key: `uploads/free/sub-1/170000000000${n}-uuid`,
  permanentKey: `uploads/files/sub-1/170000000000${n}-uuid`,
  fileName: `foto-${n}.jpg`,
  nameVersion: null,
  fileType: 'image/jpeg',
  uploadedAt: '2026-10-07T10:00:00.000Z',
  expiresAt: '2026-10-14T10:00:00.000Z',
  bytes: 1024 ** 2,
})

async function mountDialog() {
  vi.resetModules()
  const { default: PlanUpgradeDialog } = await import('./PlanUpgradeDialog.vue')
  const wrapper = mount(PlanUpgradeDialog, { global: { stubs } })
  await flushPromises()
  return wrapper
}

const button = (wrapper: Awaited<ReturnType<typeof mountDialog>>, label: string) =>
  wrapper.findAll('button').find((b) => b.text() === label)!

beforeEach(() => {
  get.mockReset()
  post.mockClear()
  storeKey.mockClear()
  requestUnlock.mockClear()
  ordine.length = 0
  unlocked.value = true
  localStorage.clear()
})

describe('PlanUpgradeDialog', () => {
  it('a un utente Free non compare', async () => {
    get.mockResolvedValue({ data: { data: { plan: 'free', files: [freeFile(1)] } } })
    const wrapper = await mountDialog()
    expect(wrapper.find('[data-testid="upgrade-dialog"]').exists()).toBe(false)
  })

  it('a un Pro con file free compare, e salva la chiave nuova PRIMA di spostare ogni file', async () => {
    get.mockResolvedValue({ data: { data: { plan: 'pro', files: [freeFile(1), freeFile(2)] } } })
    const wrapper = await mountDialog()
    expect(wrapper.text()).toContain('2 file caricati da Free')

    await button(wrapper, 'Rendili tutti permanenti').trigger('click')
    await flushPromises()

    expect(ordine).toEqual([
      `chiave ${freeFile(1).permanentKey}`,
      `promote ${freeFile(1).s3Key}`,
      `chiave ${freeFile(2).permanentKey}`,
      `promote ${freeFile(2).s3Key}`,
    ])
  })

  it('con le chiavi bloccate chiede di sbloccare e non sposta niente', async () => {
    unlocked.value = false
    get.mockResolvedValue({ data: { data: { plan: 'pro', files: [freeFile(1)] } } })
    const wrapper = await mountDialog()

    await button(wrapper, 'Rendili tutti permanenti').trigger('click')

    expect(requestUnlock).toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('«scelgo io» sposta solo i file spuntati', async () => {
    get.mockResolvedValue({ data: { data: { plan: 'pro', files: [freeFile(1), freeFile(2)] } } })
    const wrapper = await mountDialog()

    await button(wrapper, 'Scelgo io quali').trigger('click')
    await wrapper.findAll('input[type="checkbox"]')[1].trigger('change')
    await button(wrapper, 'Rendi permanenti (1)').trigger('click')
    await flushPromises()

    expect(post.mock.calls.map(([, body]) => body.s3Key)).toEqual([freeFile(1).s3Key])
  })

  it('«lasciali scadere» non sposta niente e non ripropone la domanda', async () => {
    get.mockResolvedValue({ data: { data: { plan: 'pro', files: [freeFile(1)] } } })
    const first = await mountDialog()
    await button(first, 'Lasciali scadere').trigger('click')

    expect(post).not.toHaveBeenCalled()
    const second = await mountDialog()
    expect(second.find('[data-testid="upgrade-dialog"]').exists()).toBe(false)
  })
})
