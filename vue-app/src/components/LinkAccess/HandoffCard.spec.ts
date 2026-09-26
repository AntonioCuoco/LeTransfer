import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import HandoffCard from './HandoffCard.vue'

/**
 * La carta per inoltrare un link dal telefono. Cosa difende: che si inoltri il link che le è
 * stato dato (quello pulito) e nient'altro; che chiudere il menu di condivisione non sia un
 * errore; che senza Web Share né appunti il link resti comunque raggiungibile a mano.
 */

const LINK = 'https://novren.net/share/tok00000001#key=abc&iv=def'

function setNavigator(api: { share?: unknown; clipboard?: unknown }) {
  Object.defineProperty(navigator, 'share', { value: api.share, configurable: true })
  Object.defineProperty(navigator, 'clipboard', { value: api.clipboard, configurable: true })
}

afterEach(() => setNavigator({}))

const mountCard = () => mount(HandoffCard, { props: { link: LINK, fileName: 'contratto.pdf' } })

describe('HandoffCard', () => {
  it('«Inoltra» apre il menu del sistema con il link, e il nome nel testo', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share, clipboard: { writeText: vi.fn() } })
    const wrapper = mountCard()
    await wrapper.get('[data-test="share"]').trigger('click')
    expect(share).toHaveBeenCalledWith({ title: 'contratto.pdf', text: 'Ti ho mandato «contratto.pdf» con Novren', url: LINK })
  })

  it('chiudere il menu senza scegliere non è un errore', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('annullato', 'AbortError'))
    setNavigator({ share })
    const wrapper = mountCard()
    await wrapper.get('[data-test="share"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="manual"]').exists()).toBe(false)
  })

  it('se la condivisione fallisce davvero, il link resta da copiare a mano', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    setNavigator({ share })
    const wrapper = mountCard()
    await wrapper.get('[data-test="share"]').trigger('click')
    await flushPromises()
    expect((wrapper.get('[data-test="manual"]').element as HTMLInputElement).value).toBe(LINK)
  })

  it('senza Web Share (desktop): «Copia link» copia proprio il link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } })
    const wrapper = mountCard()
    expect(wrapper.find('[data-test="share"]').exists()).toBe(false)
    await wrapper.get('[data-test="copy"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(LINK)
    expect(wrapper.get('[data-test="copy"]').text()).toContain('copiato')
  })

  it('senza HTTPS (niente Web Share né appunti): il link è subito lì, selezionabile', () => {
    setNavigator({})
    const wrapper = mountCard()
    expect((wrapper.get('[data-test="manual"]').element as HTMLInputElement).value).toBe(LINK)
  })

  it('«Scarica su questo telefono» lo chiede alla pagina', async () => {
    setNavigator({})
    const wrapper = mountCard()
    await wrapper.get('[data-test="download"]').trigger('click')
    expect(wrapper.emitted('download')).toHaveLength(1)
  })
})
