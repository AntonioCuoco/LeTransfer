import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import {
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import ConfirmEmailForm from './ConfirmEmailForm.vue'
import { notify } from '@/src/utils/notify'

/**
 * Conferma dell'email.
 *
 * Cosa difendono questi test: che un account non confermato **non resti mai bloccato**. Prima
 * non esisteva modo di chiedere un nuovo codice, e chi chiudeva la scheda al passo 2 non
 * poteva più né accedere né registrarsi di nuovo con la stessa email.
 */

const send = vi.fn()
vi.mock('@/src/utils/cognitoClient', () => ({
  cognitoClient: { send: (...args: unknown[]) => send(...args) },
  clientId: 'client-test',
  handleCognitoError: (error: { message?: string }) => error?.message ?? 'errore',
}))
vi.mock('@/src/utils/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

const EMAIL = 'antonio@esempio.it'

beforeEach(() => {
  send.mockReset()
  send.mockResolvedValue({})
  vi.mocked(notify.error).mockReset()
  // Solo gli intervalli: `flushPromises` ha bisogno dei timeout veri.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})

afterEach(() => {
  vi.useRealTimers()
})

function resendButton(wrapper: ReturnType<typeof mount>) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text().includes('Rimanda'))
  if (!button) throw new Error('pulsante "Rimanda il codice" non trovato')
  return button
}

describe('ConfirmEmailForm', () => {
  it('dopo la registrazione non rimanda il codice appena inviato, e parte in pausa', async () => {
    const wrapper = mount(ConfirmEmailForm, { props: { email: EMAIL } })
    await flushPromises()

    expect(send).not.toHaveBeenCalled()
    expect(resendButton(wrapper).attributes('disabled')).toBeDefined()
    expect(resendButton(wrapper).text()).toContain('60s')
  })

  it('dal login manda subito un nuovo codice alla stessa email', async () => {
    mount(ConfirmEmailForm, { props: { email: EMAIL, sendOnMount: true } })
    await flushPromises()

    expect(send).toHaveBeenCalledTimes(1)
    const command = send.mock.calls[0][0]
    expect(command).toBeInstanceOf(ResendConfirmationCodeCommand)
    expect(command.input).toEqual({ ClientId: 'client-test', Username: EMAIL })
  })

  it('lascia chiedere un altro codice solo quando la pausa è finita', async () => {
    const wrapper = mount(ConfirmEmailForm, { props: { email: EMAIL, sendOnMount: true } })
    await flushPromises()
    expect(resendButton(wrapper).attributes('disabled')).toBeDefined()

    vi.advanceTimersByTime(60_000)
    await flushPromises()
    expect(resendButton(wrapper).attributes('disabled')).toBeUndefined()

    await resendButton(wrapper).trigger('click')
    await flushPromises()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('conferma il codice e poi entra con la password già inserita', async () => {
    const tokens = { AccessToken: 'access', IdToken: 'id', RefreshToken: 'refresh' }
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({ AuthenticationResult: tokens })

    const wrapper = mount(ConfirmEmailForm, { props: { email: EMAIL, password: 'Password123!' } })
    await wrapper.get('input').setValue(' 123456 ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const [confirmCall, loginCall] = send.mock.calls.map((call) => call[0])
    expect(confirmCall).toBeInstanceOf(ConfirmSignUpCommand)
    expect(confirmCall.input.ConfirmationCode).toBe('123456')
    expect(loginCall).toBeInstanceOf(InitiateAuthCommand)
    expect(wrapper.emitted('confirmed')).toEqual([[tokens]])
  })

  it('con un codice scaduto non va avanti e lo dice', async () => {
    send.mockRejectedValueOnce({ name: 'ExpiredCodeException', message: 'Codice di verifica scaduto' })

    const wrapper = mount(ConfirmEmailForm, { props: { email: EMAIL, password: 'Password123!' } })
    await wrapper.get('input').setValue('123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('confirmed')).toBeUndefined()
    expect(send).toHaveBeenCalledTimes(1) // niente tentativo di login
    expect(notify.error).toHaveBeenCalledWith('Codice di verifica scaduto', 'Email non confermata')
  })
})
