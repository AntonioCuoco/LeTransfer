import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Test della ricostruzione del link (roadmap F5 / F1.3).
 *
 * Qui non si verifica una formattazione: si verifica un **rifiuto**. La ragione per
 * cui questa funzione esiste è che senza la chiave del vault il link è inservibile, e
 * consegnarlo lo stesso significa mandare in giro qualcosa che fallisce a casa di
 * qualcun altro, giorni dopo, senza spiegazioni. Il caso che conta è quello negativo.
 */

const encryptionStore = {
  isUnlocked: true,
  getKey: vi.fn<(s3Key: string) => Promise<{ key: string; iv: string } | null>>(),
}

vi.mock('@/src/stores/encryption', () => ({
  useEncryptionStore: () => encryptionStore,
}))

vi.mock('@/src/crypto/crypto', () => ({
  createKeyHash: (data: { key: string }) => `#key=${data.key}`,
}))

// Con VITE_FRONTEND_URL impostata il composable non tocca `window`, che in ambiente
// node non esiste: il test resta sul codice vero senza impalcature DOM.
vi.stubEnv('VITE_FRONTEND_URL', 'https://letransfer.app')

const { useShareLink } = await import('./useShareLink')

type TestLink = Parameters<ReturnType<typeof useShareLink>['resolveShareUrl']>[0]

function makeLink(overrides: Partial<TestLink> = {}): TestLink {
  return {
    id: 'link-1',
    publicToken: 'tok3n',
    s3Key: 'uploads/files/sub/foto.jpg',
    url: 'https://letransfer.app/share/tok3n',
    fileName: 'foto.jpg',
    isEncrypted: true,
    downloadCount: 0,
    createdAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  } as TestLink
}

beforeEach(() => {
  encryptionStore.isUnlocked = true
  encryptionStore.getKey.mockReset()
})

describe('resolveShareUrl', () => {
  it('rimette la chiave nel frammento quando il vault è aperto', async () => {
    encryptionStore.getKey.mockResolvedValue({ key: 'CHIAVE', iv: 'IV' })
    const result = await useShareLink().resolveShareUrl(makeLink())

    expect(result).toEqual({ ok: true, url: 'https://letransfer.app/share/tok3n#key=CHIAVE' })
    expect(encryptionStore.getKey).toHaveBeenCalledWith('uploads/files/sub/foto.jpg')
  })

  it('rifiuta se il vault è chiuso, invece di consegnare l’URL monco', async () => {
    encryptionStore.isUnlocked = false
    const result = await useShareLink().resolveShareUrl(makeLink())

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('locked')
    expect(encryptionStore.getKey).not.toHaveBeenCalled()
  })

  it('rifiuta se la chiave non è su questo dispositivo', async () => {
    encryptionStore.getKey.mockResolvedValue(null)
    const result = await useShareLink().resolveShareUrl(makeLink())

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing-key')
  })

  it('per un link non cifrato usa l’URL del server e non tocca il vault', async () => {
    const result = await useShareLink().resolveShareUrl(makeLink({ isEncrypted: false }))

    expect(result).toEqual({ ok: true, url: 'https://letransfer.app/share/tok3n' })
    expect(encryptionStore.getKey).not.toHaveBeenCalled()
  })

  it('non consegna mai un URL senza frammento per un file cifrato', async () => {
    // La garanzia in una riga: qualunque sia il motivo, o c'è la chiave o non c'è link.
    for (const scenario of [
      () => { encryptionStore.isUnlocked = false },
      () => { encryptionStore.getKey.mockResolvedValue(null) },
    ]) {
      encryptionStore.isUnlocked = true
      encryptionStore.getKey.mockReset()
      scenario()

      const result = await useShareLink().resolveShareUrl(makeLink())
      expect(result.ok).toBe(false)
    }
  })
})
