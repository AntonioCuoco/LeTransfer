import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Test delle due leve anti-abuso (roadmap F1.5).
 *
 * Il protocollo qui è più importante della funzione: entrambi gli endpoint rispondono
 * **in modo uniforme** per non rivelare l'esistenza di un token. Questi test fissano il
 * comportamento che ne consegue — nessun ramo della UI deve poter dedurre "quel link
 * esiste" da un errore diverso dagli altri.
 */

const post = vi.fn()

vi.mock('axios', () => ({
  default: { create: () => ({ post }) },
}))

vi.stubEnv('VITE_API_URL', '/api')

const { useGuestModeration, REPORT_REASONS } = await import('./useGuestModeration')

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: { status: 'received' } })
})

describe('reportLink', () => {
  it('chiama l’endpoint di segnalazione col motivo scelto', async () => {
    const { reportLink } = useGuestModeration()
    const ok = await reportLink('pub-token', 'malware')

    expect(ok).toBe(true)
    expect(post).toHaveBeenCalledWith('/guest/report/pub-token', { reason: 'malware' })
  })

  it('non distingue i fallimenti: un errore vale l’altro', async () => {
    const { reportLink } = useGuestModeration()

    for (const rejection of [
      { response: { status: 404 } },  // link inesistente
      { response: { status: 429 } },  // rate limited
      new Error('rete'),
    ]) {
      post.mockRejectedValueOnce(rejection)
      // Sempre `false`, mai un motivo: distinguere trasformerebbe la segnalazione in un
      // oracolo per scoprire quali token esistono.
      expect(await reportLink('pub-token', 'phishing')).toBe(false)
    }
  })

  it('espone motivi che coprono i casi reali di abuso', () => {
    expect(REPORT_REASONS.map((option) => option.value)).toEqual([
      'malware', 'phishing', 'illegal', 'copyright', 'other',
    ])
  })

  it('non manda due segnalazioni in parallelo dallo stesso click ripetuto', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    post.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))

    const { reportLink, isReporting } = useGuestModeration()
    const first = reportLink('pub-token', 'malware')
    expect(isReporting.value).toBe(true)

    expect(await reportLink('pub-token', 'malware')).toBe(false)
    expect(post).toHaveBeenCalledTimes(1)

    resolveFirst?.({ data: {} })
    await first
    expect(isReporting.value).toBe(false)
  })
})

describe('revokeTransfer', () => {
  it('revoca l’invio con il token di gestione', async () => {
    const { revokeTransfer } = useGuestModeration()
    const ok = await revokeTransfer('pub-token', 'manage-token')

    expect(ok).toBe(true)
    expect(post).toHaveBeenCalledWith('/guest/pub-token/revoke', { manageToken: 'manage-token' })
  })

  it('un token sbagliato non è distinguibile da un link inesistente', async () => {
    const { revokeTransfer } = useGuestModeration()
    post.mockRejectedValue({ response: { status: 403 } })

    expect(await revokeTransfer('pub-token', 'sbagliato')).toBe(false)
    expect(await revokeTransfer('inesistente', 'manage-token')).toBe(false)
  })
})
