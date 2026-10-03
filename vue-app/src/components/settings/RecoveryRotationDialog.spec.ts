import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { shallowRef } from 'vue'
import type { RotationOutcome } from '@/src/composables/useRecoveryKeyRotation'
import { useEncryptionStore } from '@/src/stores/encryption'
import RecoveryRotationDialog from './RecoveryRotationDialog.vue'

/**
 * Il dialogo del cambio delle 24 parole.
 *
 * Cosa difendono questi test: che il cambio **non possa partire** prima che le parole nuove
 * siano state scoperte, salvate e ridigitate, e che una password sbagliata **non costi altre
 * 24 parole da trascrivere** — il server non ha aperto niente, le stesse parole si riprovano.
 * La crittografia del cambio sta in `crypto/recoveryRotation.test.ts`.
 */

const WORDS = Array.from({ length: 24 }, (_, i) => `parola${i + 1}`)

const { rotate, requestUnlock } = vi.hoisted(() => ({ rotate: vi.fn(), requestUnlock: vi.fn() }))

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('@/src/utils/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))
vi.mock('@/src/crypto/recovery-key', () => ({ generateRecoveryKey: async () => WORDS.join(' ') }))
vi.mock('@/src/composables/useSecurityPrompt', () => ({ useSecurityPrompt: () => ({ requestUnlock }) }))
vi.mock('@/src/composables/useRecoveryKeyRotation', () => ({
  useRecoveryKeyRotation: () => ({ rotate, progress: shallowRef(null), isRunning: shallowRef(false) }),
}))

// PrimeVue non è registrato nei test di componente: bastano elementi veri.
const stubs = {
  Dialog: {
    props: ['visible'],
    template: '<div v-if="visible" role="dialog"><slot /><slot name="footer" /></div>',
  },
  Button: {
    props: ['label', 'disabled'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
  },
  Password: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input type="password" class="pwd" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}

function mountDialog(unlocked = true) {
  if (unlocked) useEncryptionStore().setMasterKey({} as CryptoKey)
  return mount(RecoveryRotationDialog, { props: { visible: true }, global: { stubs } })
}

function button(wrapper: VueWrapper, label: string) {
  const found = wrapper.findAll('button').find((b) => b.text().trim() === label)
  if (!found) throw new Error(`bottone "${label}" non trovato`)
  return found
}

/** Dall'introduzione fino al passo di verifica, con le parole scoperte. */
async function toConfirm(wrapper: VueWrapper) {
  await button(wrapper, 'Genera le parole nuove').trigger('click')
  await flushPromises()
  await button(wrapper, 'Mostra le parole').trigger('click')
  await button(wrapper, 'Le ho salvate →').trigger('click')
}

/** Ridigita le tre parole chieste, leggendo i numeri dalle etichette. */
async function answerChallenge(wrapper: VueWrapper) {
  const labels = wrapper.findAll('label').filter((l) => l.text().startsWith('Parola numero'))
  for (const label of labels) {
    const index = Number(label.text().replace('Parola numero ', '')) - 1
    await wrapper.get(`#${label.attributes('for')}`).setValue(WORDS[index])
  }
}

beforeEach(() => {
  rotate.mockReset()
  requestUnlock.mockReset()
})

describe('RecoveryRotationDialog', () => {
  it('con i file bloccati porta allo sblocco invece di generare parole', async () => {
    const wrapper = mountDialog(false)

    expect(wrapper.text()).toContain('I tuoi file sono bloccati')
    expect(wrapper.findAll('button').some((b) => b.text() === 'Genera le parole nuove')).toBe(false)

    await button(wrapper, 'Sblocca i file').trigger('click')
    expect(requestUnlock).toHaveBeenCalled()
  })

  it('le parole nascono coperte, e senza scoprirle non si va avanti', async () => {
    const wrapper = mountDialog()
    await button(wrapper, 'Genera le parole nuove').trigger('click')
    await flushPromises()

    expect(button(wrapper, 'Le ho salvate →').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Mostra le parole').trigger('click')
    expect(button(wrapper, 'Le ho salvate →').attributes('disabled')).toBeUndefined()
  })

  it('il cambio parte solo con le tre parole giuste e la password', async () => {
    const wrapper = mountDialog()
    await toConfirm(wrapper)

    expect(button(wrapper, 'Cambia le parole').attributes('disabled')).toBeDefined()
    await answerChallenge(wrapper)
    expect(button(wrapper, 'Cambia le parole').attributes('disabled')).toBeDefined()
    await wrapper.get('input.pwd').setValue('segreta')
    expect(button(wrapper, 'Cambia le parole').attributes('disabled')).toBeUndefined()
  })

  it('con la password sbagliata si riprova con le stesse parole', async () => {
    rotate
      .mockResolvedValueOnce({ ok: false, message: 'Password errata.', wrongPassword: true } satisfies RotationOutcome)
      .mockResolvedValueOnce({ ok: true } satisfies RotationOutcome)
    const wrapper = mountDialog()
    await toConfirm(wrapper)
    await answerChallenge(wrapper)
    await wrapper.get('input.pwd').setValue('sbagliata')

    await button(wrapper, 'Cambia le parole').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Password errata.')
    expect((wrapper.get('input.pwd').element as HTMLInputElement).value).toBe('')
    // Le parole ridigitate restano: manca solo la password.
    await wrapper.get('input.pwd').setValue('giusta')
    await button(wrapper, 'Cambia le parole').trigger('click')
    await flushPromises()

    expect(rotate.mock.calls.map(([, mnemonic]) => mnemonic)).toEqual([WORDS.join(' '), WORDS.join(' ')])
    expect(rotate).toHaveBeenLastCalledWith('giusta', WORDS.join(' '))
    expect(wrapper.text()).toContain('Da adesso valgono solo le parole nuove')
    expect(wrapper.emitted('rotated')).toHaveLength(1)
  })

  it('a cambio fatto le parole non sono più nella pagina', async () => {
    rotate.mockResolvedValue({ ok: true } satisfies RotationOutcome)
    const wrapper = mountDialog()
    await toConfirm(wrapper)
    await answerChallenge(wrapper)
    await wrapper.get('input.pwd').setValue('giusta')

    await button(wrapper, 'Cambia le parole').trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain(WORDS[0])
  })
})
