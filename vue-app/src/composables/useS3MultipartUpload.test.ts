import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Upload multipart cifrato: l'ordine in cui la chiave del file e i byte lasciano il browser.
 *
 * Cosa difendono questi test: che **non possa esistere un file senza chiave**. Prima la
 * chiave si salvava a fine upload e solo se il vault era sbloccato; un utente appena
 * registrato — vault chiuso per forza, le 24 parole non esistevano ancora — caricava un file
 * cifrato con una chiave che spariva alla chiusura della scheda. Barra al 100%, nessun
 * errore, file perso per sempre.
 */

const { http, store } = vi.hoisted(() => ({
  http: { post: vi.fn(), put: vi.fn() },
  store: { isUnlocked: true, storeKey: vi.fn(), removeKey: vi.fn(), prepareKey: vi.fn(), rememberKey: vi.fn() },
}))

vi.mock('axios', () => ({ default: { create: () => http } }))
vi.mock('js-cookie', () => ({ default: { get: () => 'access-token' } }))
vi.mock('@/src/stores/encryption', () => ({ useEncryptionStore: () => store }))
vi.mock('@/src/composables/useUpgradePrompt', () => ({
  useUpgradePrompt: () => ({ promptForFileSize: vi.fn(), promptWithReason: vi.fn() }),
}))
vi.mock('@/src/utils/getCurrentUser', () => ({ getCurrentUser: () => ({ sub: 'sub-di-prova' }) }))
vi.mock('@/src/utils/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

import { useS3MultipartUpload } from './useS3MultipartUpload'
import { notify } from '@/src/utils/notify'

const FILE_KEY = 'uploads/files/sub-di-prova/1700000000000-file'

/** Cosa è uscito dal browser, nell'ordine. È l'oggetto di questi test. */
const order: string[] = []

/** Un backend che conosce l'invio rapido? Se sì, `init` con la chiave allegata la salva. */
let quickBackend = false
/** Il prefisso del piano dell'account nei test: permanente, come FILE_KEY del backend «vecchio». */
let planPrefix = 'files'

async function backend(url: string, body?: Record<string, unknown>) {
  if (url.endsWith('/init')) {
    order.push('init')
    if (quickBackend && body?.uploadToken) {
      if (body.storagePrefix !== planPrefix) {
        order.push('init-prefisso-sbagliato')
        throw { response: { status: 409, data: { errorCode: 'STORAGE_PREFIX_MISMATCH', expectedPrefix: planPrefix } } }
      }
      const fileKey = `uploads/${planPrefix}/sub-di-prova/${body.uploadTime}-${body.uploadToken}-file`
      const urls = Object.fromEntries((body.partNumbers as number[]).map((n) => [n, `https://storage.test/parte-${n}`]))
      return { data: { uploadId: 'upload-1', fileKey, keyStored: true, urls } }
    }
    return { data: { uploadId: 'upload-1', fileKey: FILE_KEY } }
  }
  if (url.endsWith('/urls')) {
    order.push('urls')
    const parts = (body?.partNumbers as number[]) ?? [1]
    return { data: { urls: Object.fromEntries(parts.map((n) => [n, `https://storage.test/parte-${n}`])) } }
  }
  if (url.endsWith('/complete')) { order.push('complete'); return { data: {} } }
  if (url.endsWith('/abort')) { order.push('abort'); return { data: {} } }
  throw new Error(`chiamata inattesa: ${url}`)
}

const contratto = () => new File([new Uint8Array(2048)], 'contratto.pdf', { type: 'application/pdf' })

beforeEach(() => {
  order.length = 0
  quickBackend = false
  planPrefix = 'files'
  http.post.mockReset().mockImplementation(backend)
  http.put.mockReset().mockImplementation(async () => {
    order.push('put')
    return { headers: { etag: '"etag-1"' } }
  })
  store.isUnlocked = true
  store.storeKey.mockReset().mockImplementation(async () => {
    order.push('storeKey')
    return true
  })
  store.removeKey.mockReset().mockResolvedValue(undefined)
  // Di default la chiave non si prepara: si prova il giro classico.
  store.prepareKey.mockReset().mockResolvedValue(null)
  store.rememberKey.mockReset()
  vi.mocked(notify.warning).mockReset()
})

describe('useS3MultipartUpload — la chiave del file', () => {
  it('con il vault chiuso non manda niente al server', async () => {
    store.isUnlocked = false
    const { uploadFile, state } = useS3MultipartUpload()

    await uploadFile(contratto())

    expect(http.post).not.toHaveBeenCalled()
    expect(http.put).not.toHaveBeenCalled()
    expect(state.value.status).toBe('error')
    expect(notify.warning).toHaveBeenCalledWith(expect.stringContaining('24 parole'), 'Caricamento bloccato')
  })

  it('salva la chiave subito dopo init, prima che parta un solo byte', async () => {
    const { uploadFile, state } = useS3MultipartUpload()

    await uploadFile(contratto())
    await vi.waitFor(() => expect(state.value.status).toBe('completed'))

    expect(order).toEqual(['init', 'storeKey', 'urls', 'put', 'complete'])
    expect(store.storeKey).toHaveBeenCalledWith(
      FILE_KEY,
      expect.objectContaining({ key: expect.any(String), iv: expect.any(String) }),
    )
    expect(store.removeKey).not.toHaveBeenCalled()
  })

  it('se la chiave non si salva, chiude il multipart senza caricare il file', async () => {
    store.storeKey.mockImplementation(async () => {
      order.push('storeKey')
      return false
    })
    const { uploadFile, state } = useS3MultipartUpload()

    await uploadFile(contratto())

    expect(order).toEqual(['init', 'storeKey', 'abort'])
    expect(http.put).not.toHaveBeenCalled()
    expect(state.value.status).toBe('error')
  })

  it('se l\'upload muore dopo aver salvato la chiave, la toglie', async () => {
    http.post.mockImplementation(async (url: string) =>
      url.endsWith('/complete')
        ? Promise.reject({ response: { status: 500, data: { message: 'errore di prova' } } })
        : backend(url),
    )
    const { uploadFile, state } = useS3MultipartUpload()

    await uploadFile(contratto())
    await vi.waitFor(() => expect(state.value.status).toBe('error'))

    expect(store.removeKey).toHaveBeenCalledWith(FILE_KEY)
  })
})

/**
 * `uploadFileAndWait` serve a chi deve usare il file appena caricato (useSendFiles lo consegna).
 * Se restituisse una fileKey anche per un upload fallito, si consegnerebbe un file inesistente.
 */
describe('useS3MultipartUpload — uploadFileAndWait', () => {
  it('restituisce la fileKey quando l\'upload è completato', async () => {
    const { uploadFileAndWait } = useS3MultipartUpload()

    expect(await uploadFileAndWait(contratto())).toBe(FILE_KEY)
  })

  it('restituisce null se l\'upload non arriva in fondo', async () => {
    store.isUnlocked = false
    const { uploadFileAndWait } = useS3MultipartUpload()

    expect(await uploadFileAndWait(contratto())).toBeNull()
  })
})

/**
 * Invio rapido e URL a lotti: meno chiamate al server, stessa regola (la chiave prima dei byte).
 */
describe('useS3MultipartUpload — meno chiamate al server', () => {
  const wrapped = { wrappedKey: 'avvolta', wrapIV: 'iv-avvolgimento', fileIV: 'iv-file' }

  it('gli URL di cinque parti arrivano con una richiesta sola', async () => {
    const { uploadFile, state } = useS3MultipartUpload({ chunkSize: 1024 })

    await uploadFile(new File([new Uint8Array(5 * 1024)], 'cinque.bin'))
    await vi.waitFor(() => expect(state.value.status).toBe('completed'))

    expect(order.filter((e) => e === 'urls')).toHaveLength(1)
    expect(order.filter((e) => e === 'put')).toHaveLength(5)
  })

  it('con l’invio rapido la chiave viaggia con l’apertura: init, byte, complete', async () => {
    quickBackend = true
    store.prepareKey.mockResolvedValue(wrapped)
    const { uploadFile, state } = useS3MultipartUpload()

    await uploadFile(contratto())
    await vi.waitFor(() => expect(state.value.status).toBe('completed'))

    expect(order).toEqual(['init', 'put', 'complete'])
    expect(store.storeKey).not.toHaveBeenCalled()
    const init = http.post.mock.calls.find(([url]) => String(url).endsWith('/init'))![1]
    expect(init.wrappedFileKey).toEqual(wrapped)
    // La chiave è legata proprio alla s3Key che il server usa.
    const proposed = store.prepareKey.mock.calls[0][0]
    expect(proposed).toBe(`uploads/files/sub-di-prova/${init.uploadTime}-${init.uploadToken}-file`)
    expect(state.value.fileKey).toBe(proposed)
    expect(store.rememberKey).toHaveBeenCalledWith(proposed, expect.objectContaining({ key: expect.any(String) }))
  })

  it('con un backend vecchio torna al giro di prima e salva la chiave a parte', async () => {
    store.prepareKey.mockResolvedValue(wrapped)
    const { uploadFile, state } = useS3MultipartUpload()

    await uploadFile(contratto())
    await vi.waitFor(() => expect(state.value.status).toBe('completed'))

    expect(order).toEqual(['init', 'storeKey', 'urls', 'put', 'complete'])
    expect(store.storeKey).toHaveBeenCalledWith(FILE_KEY, expect.any(Object))
  })
})

describe('useS3MultipartUpload — il prefisso del piano', () => {
  it('con un prefisso sbagliato riprova una volta con quello giusto, e lega la chiave a lui', async () => {
    // L'ultimo upload era su un account permanente; adesso l'account è free.
    quickBackend = true
    planPrefix = 'free'
    store.prepareKey.mockResolvedValue({ wrappedKey: 'a', wrapIV: 'b', fileIV: 'c' })
    const { uploadFile, state } = useS3MultipartUpload()

    await uploadFile(contratto())
    await vi.waitFor(() => expect(state.value.status).toBe('completed'))

    expect(order).toEqual(['init', 'init-prefisso-sbagliato', 'init', 'put', 'complete'])
    const proposte = store.prepareKey.mock.calls.map(([key]) => String(key).split('/')[1])
    expect(proposte).toEqual(['files', 'free'])
    expect(state.value.fileKey).toMatch(/^uploads\/free\/sub-di-prova\//)
  })
})
