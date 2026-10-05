import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BillingIntervalChoice from './BillingIntervalChoice.vue'

/**
 * Mensile o annuale prima di Stripe (O1.5).
 *
 * Cosa difende: che il prezzo annuale mostrato sia quello del catalogo (€90, deciso il
 * 2026-10-04) e che la scelta arrivi davvero a chi avvia il pagamento. Un annuale mostrato
 * a €90 e fatturato a €108 sarebbe il difetto peggiore possibile in questa schermata.
 */

describe('BillingIntervalChoice', () => {
  it('mostra il Pro a €9 al mese o €90 all\'anno, con due mesi risparmiati', () => {
    const wrapper = mount(BillingIntervalChoice, { props: { plan: 'pro' } })

    expect(wrapper.text()).toContain('€9 al mese')
    expect(wrapper.text()).toContain('€90 all\'anno')
    expect(wrapper.text()).toContain('−2 mesi')
  })

  it('la scelta dell\'annuale arriva al modello', async () => {
    const wrapper = mount(BillingIntervalChoice, { props: { plan: 'pro', modelValue: 'month' } })

    await wrapper.findAll('button')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['year']])
  })

  it('per un piano senza annuale non mostra niente', () => {
    const wrapper = mount(BillingIntervalChoice, { props: { plan: 'business' } })

    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(false)
  })
})
