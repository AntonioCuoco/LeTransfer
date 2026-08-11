import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * Test dell'orchestrazione dell'invio senza account (roadmap F1.2).
 *
 * È il modulo più grosso del frontend e quello dove un errore costa di più: chunking,
 * cifratura per chunk, multipart concorrente, retry, zip in streaming, mappatura degli
 * errori. Finora non aveva un solo test.
 *
 * **Cosa NON si mocka**: la crittografia. `crypto/crypto.ts` gira davvero (Node 22 espone
 * Web Crypto), quindi questi test verificano il ciphertext vero, non un finto. Si mocka
 * solo la rete — che è l'unica cosa che qui non vogliamo davvero.
 *
 * Le due asserzioni che contano più di tutte le altre messe insieme:
 *  1. **la chiave non compare mai in una richiesta al server**;
 *  2. **il testo in chiaro non compare mai in ciò che si carica**.
 * Se un giorno una modifica le rompe, ha rotto il prodotto, non un test.
 */

const apiPost = vi.fn()
const storagePut = vi.fn()

vi.mock('axios', () => ({
  default: {
    // `api` viene creato con baseURL, `storageApi` senza: è così che li distinguiamo.
    create: (config?: { baseURL?: string }) =>
      config?.baseURL ? { post: apiPost } : { post: apiPost, put: storagePut },
  },
}))

vi.stubEnv('VITE_API_URL', '/api')
vi.stubEnv('VITE_FRONTEND_URL', 'https://letransfer.app')

const { useGuestUploadStore } = await import('./guestUpload')

const INIT = {
  transferId: 'transfer-1',
  publicToken: 'pub-token-1',
  manageToken: 'manage-token-1',
  uploadId: 'upload-1',
  fileKey: 'uploads/guest/transfer-1/file',
}

/** Corpi delle richieste andate al NOSTRO server, per le asserzioni sui segreti. */
function apiBodies(): string {
  return JSON.stringify(apiPost.mock.calls.map(([, body]) => body))
}

/** Byte davvero caricati sullo storage, concatenati. */
async function uploadedBytes(): Promise<Uint8Array> {
  const blobs = storagePut.mock.calls.map(([, body]) => body as Blob)
  const parts = await Promise.all(blobs.map(async (blob) => new Uint8Array(await blob.arrayBuffer())))
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function contains(haystack: Uint8Array, needle: string): boolean {
  const bytes = new TextEncoder().encode(needle)
  outer: for (let i = 0; i + bytes.length <= haystack.length; i += 1) {
    for (let j = 0; j < bytes.length; j += 1) {
      if (haystack[i + j] !== bytes[j]) continue outer
    }
    return true
  }
  return false
}

function respondOk() {
  apiPost.mockImplementation((url: string) => {
    if (url === '/guest/upload/init') return Promise.resolve({ data: INIT })
    if (url === '/guest/upload/urls') {
      return Promise.resolve({ data: { urls: { 1: 'https://storage.test/1', 2: 'https://storage.test/2', 3: 'https://storage.test/3' } } })
    }
    if (url === '/guest/upload/complete') {
      return Promise.resolve({ data: { publicToken: INIT.publicToken, url: `https://letransfer.app/share/${INIT.publicToken}`, expiresAt: '2026-08-09T10:00:00.000Z' } })
    }
    return Promise.resolve({ data: {} })
  })
  storagePut.mockResolvedValue({ headers: { etag: '"etag-1"' } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  apiPost.mockReset()
  storagePut.mockReset()
  respondOk()
})

describe('invio di un file singolo', () => {
  it('percorre init → urls → PUT → complete e produce un link con la chiave nel frammento', async () => {
    const store = useGuestUploadStore()
    await store.upload([new File(['contenuto riservato'], 'relazione.pdf', { type: 'application/pdf' })])

    expect(store.status).toBe('done')
    expect(store.progress).toBe(100)

    const urls = apiPost.mock.calls.map(([url]) => url)
    expect(urls).toEqual(['/guest/upload/init', '/guest/upload/urls', '/guest/upload/complete'])

    expect(store.result?.shareUrl).toMatch(/^https:\/\/letransfer\.app\/share\/pub-token-1#key=.+&iv=.+$/)
    expect(store.result?.manageToken).toBe(INIT.manageToken)
    expect(store.fileProgress).toEqual([
      expect.objectContaining({ name: 'relazione.pdf', percent: 100, status: 'done' }),
    ])
  })

  it('NON manda mai la chiave al server', async () => {
    const store = useGuestUploadStore()
    await store.upload([new File(['contenuto riservato'], 'relazione.pdf')])

    // La chiave vive solo nel frammento del link, che il browser non invia mai.
    const fragment = store.result!.shareUrl.split('#')[1]
    const key = decodeURIComponent(new URLSearchParams(fragment).get('key')!)

    expect(key.length).toBeGreaterThan(20)
    expect(apiBodies()).not.toContain(key)
    // Nemmeno un pezzo: un prefisso in un log basterebbe a ridurre lo spazio di ricerca.
    expect(apiBodies()).not.toContain(key.slice(0, 12))
  })

  it('carica ciphertext, non il file in chiaro', async () => {
    const store = useGuestUploadStore()
    await store.upload([new File(['SEGRETO-IN-CHIARO-1234567890'], 'nota.txt')])

    const bytes = await uploadedBytes()
    expect(bytes.length).toBeGreaterThan(0)
    expect(contains(bytes, 'SEGRETO-IN-CHIARO-1234567890')).toBe(false)
    expect(contains(bytes, 'SEGRETO')).toBe(false)
  })

  it('dichiara al server la dimensione del ciphertext, non quella del file', async () => {
    const store = useGuestUploadStore()
    const plain = 'x'.repeat(1000)
    await store.upload([new File([plain], 'grande.bin')])

    const init = apiPost.mock.calls.find(([url]) => url === '/guest/upload/init')![1] as { fileSize: number }
    // v2 aggiunge IV e tag GCM a ogni chunk: il conto dichiarato deve tenerne conto,
    // altrimenti il cap lato server rifiuterebbe file che invece stanno nei limiti.
    expect(init.fileSize).toBeGreaterThan(1000)
  })

  it('spezza in parti i file oltre la soglia del multipart, in ordine', async () => {
    const store = useGuestUploadStore()
    // 12 MB con chunk da 10 MB → 2 parti.
    await store.upload([new File([new Uint8Array(12 * 1024 * 1024)], 'video.mp4')])

    expect(storagePut).toHaveBeenCalledTimes(2)
    const complete = apiPost.mock.calls.find(([url]) => url === '/guest/upload/complete')![1] as {
      parts: { PartNumber: number; ETag: string }[]
    }
    expect(complete.parts.map((part) => part.PartNumber)).toEqual([1, 2])
  })
})

describe('invio di più file (zip in streaming)', () => {
  it('impacchetta in un solo archivio e traccia ogni file', async () => {
    const store = useGuestUploadStore()
    await store.upload([
      new File(['primo contenuto'], 'uno.txt'),
      new File(['secondo contenuto'], 'due.txt'),
    ])

    expect(store.status).toBe('done')
    const complete = apiPost.mock.calls.find(([url]) => url === '/guest/upload/complete')![1] as { fileName: string; fileType: string }
    expect(complete.fileName).toBe('trasferimento.zip')

    expect(store.fileProgress.map((entry) => entry.name)).toEqual(['uno.txt', 'due.txt'])
    expect(store.fileProgress.every((entry) => entry.status === 'done' && entry.percent === 100)).toBe(true)
  })

  it('non lascia in chiaro nemmeno i nomi dentro l’archivio', async () => {
    const store = useGuestUploadStore()
    await store.upload([
      new File(['alfa'], 'contratto-riservato.txt'),
      new File(['beta'], 'altro.txt'),
    ])

    const bytes = await uploadedBytes()
    // Lo zip conterrebbe i nomi in chiaro nelle intestazioni: qui è tutto cifrato prima
    // di partire, quindi non deve affiorare nulla.
    expect(contains(bytes, 'contratto-riservato.txt')).toBe(false)
    expect(contains(bytes, 'alfa')).toBe(false)
  })

  it('usa il nome della cartella per l’archivio quando i file ne hanno una', async () => {
    const store = useGuestUploadStore()
    const withPath = new File(['x'], 'foto/mare/uno.jpg')
    await store.upload([withPath, new File(['y'], 'foto/mare/due.jpg')])

    const complete = apiPost.mock.calls.find(([url]) => url === '/guest/upload/complete')![1] as { fileName: string }
    expect(complete.fileName).toBe('foto.zip')
  })
})

describe('errori e resilienza', () => {
  it('riprova una parte che fallisce invece di buttare via il trasferimento', async () => {
    storagePut
      .mockRejectedValueOnce(new Error('rete interrotta'))
      .mockResolvedValue({ headers: { etag: '"etag-ok"' } })

    const store = useGuestUploadStore()
    await store.upload([new File(['dato'], 'file.txt')])

    expect(store.status).toBe('done')
    expect(storagePut.mock.calls.length).toBeGreaterThan(1)
  })

  it('traduce gli errori del server in frasi comprensibili', async () => {
    const cases: { rejection: unknown; expected: RegExp }[] = [
      { rejection: { response: { status: 413 } }, expected: /limite per l’invio senza account/i },
      { rejection: { response: { status: 429 } }, expected: /troppi invii/i },
      { rejection: { response: { status: 403, data: { errorCode: 'CAPTCHA_FAILED' } } }, expected: /anti-bot/i },
      { rejection: { response: { status: 503 } }, expected: /non disponibile/i },
      { rejection: new Error('boom'), expected: /qualcosa è andato storto/i },
    ]

    for (const { rejection, expected } of cases) {
      setActivePinia(createPinia())
      apiPost.mockReset()
      apiPost.mockRejectedValue(rejection)

      const store = useGuestUploadStore()
      await store.upload([new File(['x'], 'f.txt')])

      expect(store.status).toBe('error')
      expect(store.errorMessage).toMatch(expected)
    }
  })

  it('non lascia un ETag mancante passare per un caricamento riuscito', async () => {
    storagePut.mockResolvedValue({ headers: {} })

    const store = useGuestUploadStore()
    await store.upload([new File(['x'], 'f.txt')])

    // Senza ETag il `complete` non potrebbe ricomporre l'oggetto: meglio fallire qui.
    expect(store.status).toBe('error')
  })
})

describe('ciclo di vita dello store', () => {
  it('ignora un secondo invio mentre uno è in corso', async () => {
    const store = useGuestUploadStore()
    const first = store.upload([new File(['a'], 'a.txt')])
    await store.upload([new File(['b'], 'b.txt')])
    await first

    expect(apiPost.mock.calls.filter(([url]) => url === '/guest/upload/init')).toHaveLength(1)
  })

  it('conserva le etichette del trasferimento, che al widget servono dopo', async () => {
    const store = useGuestUploadStore()
    await store.upload([new File(['a'], 'a.txt')], {}, { summary: '1 file · cifrato', claimName: 'a.txt' })

    expect(store.summary).toBe('1 file · cifrato')
    expect(store.claimName).toBe('a.txt')
  })

  it('reset riporta tutto allo stato iniziale', async () => {
    const store = useGuestUploadStore()
    await store.upload([new File(['a'], 'a.txt')])
    store.reset()

    expect(store.status).toBe('idle')
    expect(store.progress).toBe(0)
    expect(store.result).toBeNull()
    expect(store.fileProgress).toEqual([])
    expect(store.summary).toBe('')
    expect(store.isBusy).toBe(false)
  })

  it('passa le opzioni dell’invio al server (scadenza, password, max download)', async () => {
    const store = useGuestUploadStore()
    await store.upload([new File(['a'], 'a.txt')], {
      turnstileToken: 'tk',
      expiresInHours: 24,
      password: 'segreta',
      maxDownloads: 3,
    })

    const init = apiPost.mock.calls.find(([url]) => url === '/guest/upload/init')![1] as { turnstileToken: string }
    expect(init.turnstileToken).toBe('tk')

    const complete = apiPost.mock.calls.find(([url]) => url === '/guest/upload/complete')![1] as {
      expiresInHours: number; password: string; maxDownloads: number
    }
    expect(complete).toMatchObject({ expiresInHours: 24, password: 'segreta', maxDownloads: 3 })
  })
})
