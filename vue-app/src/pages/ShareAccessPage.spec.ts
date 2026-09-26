import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { exportIVToBase64, exportKeyToBase64, generateAESKey, generateIV } from '@/src/crypto/crypto'

/**
 * La pagina del link, nella modalità «consegna» (QR di `novren send`).
 *
 * Cosa difende: che inquadrare il QR del proprio invio NON registri un accesso (niente
 * `access`, niente download consumati); che il segnale sparisca subito dall'indirizzo; che il
 * link da inoltrare sia quello pulito; che senza il segnale la pagina sia quella di sempre.
 */

const { accessLink, getLinkInfo } = vi.hoisted(() => ({ accessLink: vi.fn(), getLinkInfo: vi.fn() }))

vi.mock('@/src/composables/usePublicLink', () => ({
  usePublicLink: () => {
    const linkInfo = ref<Record<string, unknown> | null>(null)
    return {
      linkInfo,
      linkStatus: ref('valid'),
      isLoading: ref(false),
      error: ref(null),
      getLinkInfo: async (token: string) => {
        const info = await getLinkInfo(token)
        linkInfo.value = info
        return info
      },
      accessLink,
      downloadFile: vi.fn(),
    }
  },
}))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { publicToken: 'tok00000001' } }) }))
vi.mock('@/src/components/landing/PublicShell.vue', () => ({
  default: { name: 'PublicShell', template: '<div><slot /><slot name="footer" /></div>' },
}))
vi.mock('@/src/components/LinkAccess/ReportLinkDialog.vue', () => ({ default: { template: '<div />' } }))

import ShareAccessPage from './ShareAccessPage.vue'

let fragment = ''

beforeEach(async () => {
  accessLink.mockReset()
  getLinkInfo.mockReset()
  getLinkInfo.mockResolvedValue({
    fileName: 'contratto.pdf',
    fileSize: '2.4 MB',
    fileType: 'application/pdf',
    isPasswordProtected: false,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  })
  const key = await generateAESKey()
  fragment = `#key=${encodeURIComponent(await exportKeyToBase64(key))}&iv=${encodeURIComponent(exportIVToBase64(generateIV()))}`
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
})
afterEach(() => window.history.replaceState(null, '', '/'))

describe('ShareAccessPage — consegna dal QR', () => {
  it('mostra «inoltra», non chiede il nome e non registra nessun accesso', async () => {
    window.history.replaceState(null, '', `/share/tok00000001${fragment}&via=qr`)
    const wrapper = mount(ShareAccessPage)
    await flushPromises()

    expect(wrapper.text()).toContain('Mandalo tu')
    expect(wrapper.find('[data-test="download"]').exists()).toBe(true)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(accessLink).not.toHaveBeenCalled()
  })

  it('il segnale sparisce dall’indirizzo, e il link da inoltrare è quello pulito', async () => {
    window.history.replaceState(null, '', `/share/tok00000001${fragment}&via=qr`)
    const wrapper = mount(ShareAccessPage)
    await flushPromises()

    expect(window.location.hash).toBe(fragment)
    const manual = wrapper.get('[data-test="manual"]').element as HTMLInputElement
    expect(manual.value).toBe(`${window.location.origin}/share/tok00000001${fragment}`)
  })

  it('«Scarica su questo telefono» riporta al flusso normale di chi riceve', async () => {
    window.history.replaceState(null, '', `/share/tok00000001${fragment}&via=qr`)
    const wrapper = mount(ShareAccessPage)
    await flushPromises()

    await wrapper.get('[data-test="download"]').trigger('click')
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Mandalo tu')
  })

  it('senza il segnale la pagina è quella di sempre', async () => {
    window.history.replaceState(null, '', `/share/tok00000001${fragment}`)
    const wrapper = mount(ShareAccessPage)
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('[data-test="download"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Ti hanno mandato un file.')
  })
})
