import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { UploadAvailability } from '@/src/composables/useUploadAvailability'
import UploadVaultGate from './UploadVaultGate.vue'

/**
 * La patina sugli uploader.
 *
 * Cosa difendono questi test: che con il vault chiuso l'uploader **non sia raggiungibile** e
 * che il pulsante porti nel posto giusto — creare le 24 parole se non esistono, reinserirle
 * se esistono. Mandare chi non le ha a "sbloccare" sarebbe un vicolo cieco.
 */

const { availability, push, requestUnlock } = vi.hoisted(() => ({
  availability: { value: 'ready' as UploadAvailability },
  push: vi.fn(),
  requestUnlock: vi.fn(),
}))

vi.mock('@/src/composables/useUploadAvailability', () => ({
  useUploadAvailability: () => ({ availability: state }),
}))
vi.mock('@/src/composables/useSecurityPrompt', () => ({ useSecurityPrompt: () => ({ requestUnlock }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

// Reattivo, così il componente vede i cambi di stato fatti dai test.
const state = ref<UploadAvailability>(availability.value)

// PrimeVue non è registrato nei test di componente: basta un bottone vero.
const ButtonStub = {
  props: ['label'],
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')">{{ label }}</button>',
}

function mountGate(value: UploadAvailability) {
  state.value = value
  return mount(UploadVaultGate, {
    slots: { default: '<div class="uploader">Trascina file o cartelle</div>' },
    global: { stubs: { Button: ButtonStub } },
  })
}

beforeEach(() => {
  push.mockReset()
  requestUnlock.mockReset()
})

describe('UploadVaultGate', () => {
  it('con il vault sbloccato lascia l\'uploader com\'è', () => {
    const wrapper = mountGate('ready')

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="upload-content"]').attributes('inert')).toBeUndefined()
  })

  it('senza chiave di recupero blocca l\'uploader e manda a creare le 24 parole', async () => {
    const wrapper = mountGate('needs-setup')

    expect(wrapper.get('[role="status"]').text()).toContain('Finché non crei la chiave di recupero non potrai caricare')
    expect(wrapper.get('[data-testid="upload-content"]').attributes('inert')).toBeDefined()

    await wrapper.get('[role="status"] button').trigger('click')
    expect(push).toHaveBeenCalledWith({ path: '/app/settings', query: { chiave: 'crea' } })
    expect(requestUnlock).not.toHaveBeenCalled()
  })

  it('con la chiave già creata ma il vault chiuso apre lo sblocco', async () => {
    const wrapper = mountGate('locked')

    await wrapper.get('[role="status"] button').trigger('click')
    expect(requestUnlock).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('mentre verifica resta bloccato, senza azioni da premere', () => {
    const wrapper = mountGate('checking')

    expect(wrapper.get('[data-testid="upload-content"]').attributes('inert')).toBeDefined()
    expect(wrapper.find('[role="status"] button').exists()).toBe(false)
  })
})
