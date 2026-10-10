import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SecretRevealCard from './SecretRevealCard.vue'

/**
 * Un segreto aperto nel browser. Cosa difende: che prima di aprirlo si dica che si legge una
 * volta sola (aprirlo consuma il link per tutti), e che dopo il testo si possa copiare così
 * com'è, senza a capo aggiunti né spazi tolti.
 */

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
})

describe('SecretRevealCard', () => {
  it('prima di aprirlo avvisa che si legge una volta, e il bottone chiede di mostrarlo', async () => {
    const wrapper = mount(SecretRevealCard, { props: { text: null, fileName: 'segreto' } })
    expect(wrapper.text()).toContain('Si legge una volta sola')
    await wrapper.get('[data-test="reveal"]').trigger('click')
    expect(wrapper.emitted('reveal')).toHaveLength(1)
  })

  it('aperto: mostra il testo e lo copia identico', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const env = 'DATABASE_URL=postgres://u:p@db/x\nSTRIPE_KEY=sk_test_1\n'
    const wrapper = mount(SecretRevealCard, { props: { text: env, fileName: '.env' } })

    expect(wrapper.get('[data-test="secret-text"]').element.textContent).toBe(env)
    await wrapper.get('[data-test="copy"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(env)
    expect(wrapper.get('[data-test="copy"]').text()).toBe('Copiato')
  })

  it('senza appunti disponibili resta «Salva come file»', () => {
    const wrapper = mount(SecretRevealCard, { props: { text: 'abc', fileName: 'segreto' } })
    expect(wrapper.find('[data-test="copy"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="save"]').exists()).toBe(true)
  })
})
