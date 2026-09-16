import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

/**
 * Registrazione chiusa (2026-09-16).
 *
 * Cosa difende questo test: che con l'interruttore chiuso il modulo **non sia in pagina** e che
 * da qui non parta nessuna chiamata a Cognito. La registrazione non passa dal nostro backend:
 * `SignUpCommand` va da Cognito direttamente, quindi un modulo lasciato raggiungibile creerebbe
 * account veri anche a blocco «attivo».
 *
 * I test si spengono da soli quando le iscrizioni riapriranno (`it.skipIf`): riaprire è mettere
 * `REGISTRATION_OPEN = true`, non andare a cancellare dei test.
 */

const { send, push } = vi.hoisted(() => ({ send: vi.fn(), push: vi.fn() }))

vi.mock('vue-router', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
vi.mock('js-cookie', () => ({ default: { get: () => undefined } }))
vi.mock('sweetalert2', () => ({ default: { fire: vi.fn() } }))
vi.mock('@/src/utils/cognitoClient', () => ({
  cognitoClient: { send },
  clientId: 'client-di-test',
  handleCognitoError: (error: unknown) => String(error),
}))

// I figli non sono l'oggetto di questo test: contano solo il modulo e l'avviso. Gli stub sono
// scritti per esteso perché `vi.mock` viene spostato in cima al file: una funzione d'aiuto
// definita qui sotto non esisterebbe ancora quando la fabbrica viene eseguita.
vi.mock('@/src/components/landing/PublicShell.vue', () => ({ default: { name: 'PublicShell', template: '<div><slot /></div>' } }))
vi.mock('@/src/components/landing/BrandSeal.vue', () => ({ default: { name: 'BrandSeal', template: '<div />' } }))
vi.mock('@/src/components/ui/FieldInput.vue', () => ({ default: { name: 'FieldInput', template: '<div />' } }))
vi.mock('@/src/components/GoogleLoginButton.vue', () => ({ default: { name: 'GoogleLoginButton', template: '<div />' } }))
vi.mock('@/src/components/auth/ConfirmEmailForm.vue', () => ({ default: { name: 'ConfirmEmailForm', template: '<div />' } }))

import RegisterPage from './RegisterPage.vue'
import { REGISTRATION_OPEN, REGISTRATION_CLOSED_MESSAGE } from '@/src/utils/registration'

describe('RegisterPage con le iscrizioni chiuse', () => {
  it.skipIf(REGISTRATION_OPEN)('non mostra il modulo e dice perché', () => {
    const wrapper = mount(RegisterPage)

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.get('[data-testid="registration-closed"]').text()).toContain(REGISTRATION_CLOSED_MESSAGE)
    expect(send).not.toHaveBeenCalled()
  })

  it.skipIf(REGISTRATION_OPEN)('manda all’accesso chi un account ce l’ha già', async () => {
    const wrapper = mount(RegisterPage)

    await wrapper.get('[data-testid="registration-closed"] button').trigger('click')

    expect(push).toHaveBeenCalledWith('/login')
    expect(send).not.toHaveBeenCalled()
  })
})
