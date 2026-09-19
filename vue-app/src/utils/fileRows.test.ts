import { describe, it, expect } from 'vitest'
import { formatRowDate, receivedFileRow } from './fileRows'
import type { SharedFile } from '@/src/types'

/**
 * Cosa difendono questi test: che la tabella dei file **dica la verità su ciò che il server ha
 * mandato**. Qui gli sbagli non fanno rumore — la riga si disegna comunque — e raccontano una
 * cosa falsa a chi guarda:
 *
 *  - una data letta dal campo sbagliato diventa «Sconosciuta», e sembra che il dato non esista;
 *  - la colonna «Cifrato» a «—» su un file cifrato end-to-end nega la proprietà su cui si regge
 *    il prodotto, proprio nel punto in cui l'utente la cerca.
 *
 * I nomi dei campi sono quelli veri di `GET /api/shared-files`: `sharedAt` e `uploadedAt`, non
 * `createdAt`; `senderEmail`, non `ownerEmail`.
 */

const base: SharedFile = {
  shareId: '122e747c-d72d-4ea0-8aff-27744ce55e95',
  s3Key: 'uploads/requests/f1329fe8/foto.png',
  ownerId: '03c4c852-0081-7051-071b-4e758311d82c',
  fileName: 'foto.png',
  fileSize: 382339,
  fileType: 'image/png',
  sharedAt: '2026-09-16T21:35:17.661Z',
  s3Url: 'https://storage.example/foto.png?firma',
}

const share = (extra: Partial<SharedFile> = {}): SharedFile => ({ ...base, ...extra })

describe('formatRowDate', () => {
  it('formatta la data in italiano', () => {
    expect(formatRowDate('2026-09-16T21:35:17.661Z')).toBe('16/09/2026')
  })

  it.each([undefined, null, '', 'non-una-data'])('dice «Sconosciuta» solo quando non c’è una data vera: %s', (valore) => {
    expect(formatRowDate(valore)).toBe('Sconosciuta')
  })
})

describe('receivedFileRow', () => {
  it('prende la data dalla condivisione, come la manda il server', () => {
    const row = receivedFileRow(share(), 'foto.png')

    expect(row.date).toBe('16/09/2026')
    expect(row.originalFile?.sharedAt).toBe(base.sharedAt)
  })

  it('se manca la data della condivisione usa quella del file', () => {
    const row = receivedFileRow(share({ sharedAt: undefined, uploadedAt: '2026-09-14T08:00:00.000Z' }), 'foto.png')

    expect(row.date).toBe('14/09/2026')
  })

  it('senza nessuna data lo dice, invece di inventarne una', () => {
    const row = receivedFileRow(share({ sharedAt: undefined }), 'foto.png')

    expect(row.date).toBe('Sconosciuta')
  })

  it('un file con la chiave wrappata risulta cifrato end-to-end', () => {
    const row = receivedFileRow(share({ encryptedAESKey: 'v2.abc.def', encryptionIV: 'uPSsDTO4KOch_3_5' }), 'foto.png')

    expect(row.originalFile?.isEncrypted).toBe(true)
    expect(row.originalFile?.encryptedAESKey).toBe('v2.abc.def')
    expect(row.originalFile?.encryptionIV).toBe('uPSsDTO4KOch_3_5')
  })

  it('senza chiave wrappata non dichiara una cifratura che non c’è', () => {
    const row = receivedFileRow(share(), 'foto.png')

    expect(row.originalFile?.isEncrypted).toBe(false)
  })

  it('da una condivisione fra utenti mostra l’email di chi l’ha mandata', () => {
    const row = receivedFileRow(share({ senderEmail: 'bob@esempio.it' }), 'foto.png')

    expect(row.senderEmail).toBe('bob@esempio.it')
  })

  it('da una richiesta file mostra il nome digitato, che non è un’identità accertata', () => {
    const row = receivedFileRow(share({ viaRequest: true, uploaderName: 'antonio cuoco' }), 'foto.png')

    expect(row.senderEmail).toBe('antonio cuoco')
  })

  it('da una richiesta file senza nome lo dice invece di fingere un mittente', () => {
    const row = receivedFileRow(share({ viaRequest: true }), 'foto.png')

    expect(row.senderEmail).toBe('Nome non indicato')
  })

  it('porta con sé i dati che servono ad aprire il file', () => {
    const row = receivedFileRow(share({ formatVersion: 2, chunkSize: 10485760, originalSize: 382311, nameVersion: 2 }), 'foto.png')

    expect(row.originalFile).toMatchObject({ formatVersion: 2, chunkSize: 10485760, originalSize: 382311, nameVersion: 2 })
    expect(row.status).toBe('received')
    expect(row.isReceived).toBe(true)
  })
})
