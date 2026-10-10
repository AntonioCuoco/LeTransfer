import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * La lettura della chiave di un file — `useFileKeysAPI.getFileKey`.
 *
 * Cosa difende: il backend risponde con la chiave al primo livello (`routes/e2e.js`), e per mesi
 * qui si è letto `data.data`, cioè sempre niente. Il sintomo era silenzioso: dopo un
 * ricaricamento nessuna chiave salvata si apriva. Si accettano entrambe le forme.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('axios', () => ({ default: { get, post: vi.fn(), delete: vi.fn() } }))
vi.mock('js-cookie', () => ({ default: { get: () => 'token' } }))
vi.mock('@/src/utils/apiError', () => ({ notifyApiError: vi.fn(() => 'errore') }))

import { useFileKeysAPI } from './useFileKeysAPI'

const key = { s3Key: 'uploads/files/sub/1-x', wrappedKey: 'WWW', wrapIV: 'III', fileIV: 'FFF' }

beforeEach(() => {
  get.mockReset()
})

describe('getFileKey', () => {
  it('legge la chiave al primo livello, com\'è la risposta del backend', async () => {
    get.mockResolvedValue({ data: key })
    expect(await useFileKeysAPI().getFileKey(key.s3Key)).toEqual(key)
  })

  it('legge anche la forma { data: … }', async () => {
    get.mockResolvedValue({ data: { success: true, data: key } })
    expect(await useFileKeysAPI().getFileKey(key.s3Key)).toEqual(key)
  })

  it('una risposta senza chiave è «nessuna chiave», non un oggetto vuoto', async () => {
    get.mockResolvedValue({ data: { success: true } })
    expect(await useFileKeysAPI().getFileKey(key.s3Key)).toBeNull()
  })

  it('404 = la chiave non esiste', async () => {
    get.mockImplementation(async () => {
      throw Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } })
    })
    expect(await useFileKeysAPI().getFileKey(key.s3Key)).toBeNull()
  })
})
