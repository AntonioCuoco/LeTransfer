import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * «Manda a una persona»: l'ordine dei passi.
 *
 * Cosa difendono questi test: che non parta niente a metà. Se un destinatario non è pronto o
 * l'utente non conferma la sua impronta, nessun file va caricato né consegnato — altrimenti
 * metà dei destinatari riceve e l'altra no, e l'utente non sa più cosa è partito. E che un
 * file dal computer si carichi una volta sola, anche con più destinatari o riprovando.
 */

const { share, uploader, order } = vi.hoisted(() => ({
  share: {
    ensureVaultUnlocked: vi.fn(),
    getShareableKey: vi.fn(),
    prepareRecipient: vi.fn(),
    deliverFile: vi.fn(),
  },
  uploader: { uploadFileAndWait: vi.fn() },
  order: [] as string[],
}))

vi.mock('@/src/composables/useShareFile', () => ({ useShareFile: () => share }))
vi.mock('@/src/composables/useS3MultipartUpload', () => ({ useS3MultipartUpload: () => uploader }))
vi.mock('@/src/utils/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

import { useSendFiles, type SendItem } from './useSendFiles'

const CHIAVE_PUBBLICA = {} as CryptoKey

const dalComputer = (name = 'contratto.pdf'): SendItem => ({
  id: name, name, size: 2048, source: 'local', file: new File(['x'], name), status: 'pending',
})
const dalMioSpazio = (s3Key = 'uploads/files/sub/1-fattura'): SendItem => ({
  id: s3Key, name: 'fattura.pdf', size: '1 KB', source: 'space', s3Key, status: 'pending',
})

beforeEach(() => {
  order.length = 0
  share.ensureVaultUnlocked.mockReset().mockReturnValue(true)
  share.getShareableKey.mockReset().mockResolvedValue({ key: 'k', iv: 'i' })
  share.prepareRecipient.mockReset().mockImplementation(async (email: string) => {
    order.push(`verifica ${email}`)
    return { email, publicKey: CHIAVE_PUBBLICA }
  })
  share.deliverFile.mockReset().mockImplementation(async (s3Key: string, recipient: { email: string }) => {
    order.push(`consegna ${s3Key} → ${recipient.email}`)
    return { shareId: `${s3Key}-${recipient.email}` }
  })
  uploader.uploadFileAndWait.mockReset().mockImplementation(async (file: File) => {
    order.push(`upload ${file.name}`)
    return `uploads/files/sub/1-${file.name}`
  })
})

describe('useSendFiles', () => {
  it('verifica tutti i destinatari, poi carica una volta, poi consegna a ciascuno', async () => {
    const item = dalComputer()
    const outcome = await useSendFiles().send([item], ['bob@esempio.it', 'eva@esempio.it'])

    expect(order).toEqual([
      'verifica bob@esempio.it',
      'verifica eva@esempio.it',
      'upload contratto.pdf',
      'consegna uploads/files/sub/1-contratto.pdf → bob@esempio.it',
      'consegna uploads/files/sub/1-contratto.pdf → eva@esempio.it',
    ])
    expect(outcome).toEqual({ aborted: false, delivered: 2, failed: 0 })
    expect(item.status).toBe('sent')
  })

  it('se un destinatario non viene confermato non carica né consegna niente', async () => {
    share.prepareRecipient.mockImplementation(async (email: string) =>
      email === 'eva@esempio.it' ? null : { email, publicKey: CHIAVE_PUBBLICA })

    const outcome = await useSendFiles().send([dalComputer()], ['bob@esempio.it', 'eva@esempio.it'])

    expect(outcome.aborted).toBe(true)
    expect(uploader.uploadFileAndWait).not.toHaveBeenCalled()
    expect(share.deliverFile).not.toHaveBeenCalled()
  })

  it('un file del tuo spazio senza chiave ferma tutto prima di chiedere le impronte', async () => {
    share.getShareableKey.mockResolvedValue(null)
    const item = dalMioSpazio()

    const outcome = await useSendFiles().send([item], ['bob@esempio.it'])

    expect(outcome.aborted).toBe(true)
    expect(share.prepareRecipient).not.toHaveBeenCalled()
    expect(item.status).toBe('error')
  })

  it('con il vault chiuso non fa nulla', async () => {
    share.ensureVaultUnlocked.mockReturnValue(false)

    const outcome = await useSendFiles().send([dalComputer()], ['bob@esempio.it'])

    expect(outcome.aborted).toBe(true)
    expect(share.prepareRecipient).not.toHaveBeenCalled()
    expect(uploader.uploadFileAndWait).not.toHaveBeenCalled()
  })

  it('una consegna fallita su due segna il file come parziale', async () => {
    share.deliverFile.mockImplementation(async (_s3Key: string, recipient: { email: string }) =>
      recipient.email === 'eva@esempio.it' ? null : { shareId: 'ok' })
    const item = dalMioSpazio()

    const outcome = await useSendFiles().send([item], ['bob@esempio.it', 'eva@esempio.it'])

    expect(outcome).toEqual({ aborted: false, delivered: 1, failed: 1 })
    expect(item.status).toBe('partial')
  })

  it('se l\'upload fallisce quel file non viene consegnato, gli altri sì', async () => {
    uploader.uploadFileAndWait.mockResolvedValue(null)
    const rotto = dalComputer('rotto.pdf')
    const buono = dalMioSpazio()

    const outcome = await useSendFiles().send([rotto, buono], ['bob@esempio.it'])

    expect(rotto.status).toBe('error')
    expect(buono.status).toBe('sent')
    expect(outcome).toEqual({ aborted: false, delivered: 1, failed: 1 })
  })

  it('riprovando dopo una consegna fallita non ricarica il file dal computer', async () => {
    share.deliverFile.mockResolvedValueOnce(null)
    const item = dalComputer()
    const { send } = useSendFiles()

    await send([item], ['bob@esempio.it'])
    expect(item.status).toBe('error')

    await send([item], ['bob@esempio.it'])

    expect(uploader.uploadFileAndWait).toHaveBeenCalledTimes(1)
    expect(item.status).toBe('sent')
  })
})
