import { describe, it, expect } from 'vitest'
import { errorDetail, withDetail, unexpectedResponse } from './errorDetail'
import { describeApiError } from './apiError'

/**
 * Il dettaglio che finisce in coda a ogni toast d'errore. Ogni caso qui è uno che prima
 * produceva la stessa frase generica di tutti gli altri.
 */

const axiosError = (over: Record<string, unknown>) => ({
  isAxiosError: true,
  message: 'Request failed',
  config: { method: 'post', url: 'https://api.novren.net/shared-links/abc/access' },
  ...over,
})

describe('errorDetail — errori di rete e HTTP', () => {
  it('con una risposta dice status, metodo e percorso', () => {
    const detail = errorDetail(axiosError({ response: { status: 502, statusText: 'Bad Gateway' } }))
    expect(detail).toBe('HTTP 502 Bad Gateway · POST /shared-links/abc/access')
  })

  it('senza risposta distingue la rete assente dal timeout', () => {
    expect(errorDetail(axiosError({ code: 'ERR_NETWORK' }))).toMatch(/ERR_NETWORK — nessuna risposta.*CORS/)
    expect(errorDetail(axiosError({ code: 'ECONNABORTED' }))).toMatch(/ECONNABORTED — tempo scaduto/)
  })

  it('non mostra MAI la query: gli URL firmati di S3 ci tengono la firma', () => {
    const detail = errorDetail(axiosError({
      response: { status: 403 },
      config: { method: 'put', url: 'https://bucket.s3.amazonaws.com/file?X-Amz-Signature=segreto&X-Amz-Credential=x' },
    }))
    expect(detail).toBe('HTTP 403 · PUT /file')
    expect(detail).not.toMatch(/segreto|Amz/)
  })
})

describe('errorDetail — errori del browser', () => {
  it('un OperationError di Web Crypto senza messaggio conserva almeno il nome', () => {
    expect(errorDetail(new DOMException('', 'OperationError'))).toBe('OperationError')
  })

  it('una RangeError di memoria arriva con il suo testo', () => {
    expect(errorDetail(new RangeError('Array buffer allocation failed'))).toBe('RangeError: Array buffer allocation failed')
  })

  it('un oggetto lanciato a mano mostra il contenuto, non «[object Object]»', () => {
    expect(errorDetail({ code: 42 })).toBe('{"code":42}')
  })
})

describe('withDetail', () => {
  it('aggiunge il dettaglio fra parentesi quadre', () => {
    expect(withDetail('Copia non riuscita.', new DOMException('Document is not focused.', 'NotAllowedError')))
      .toBe('Copia non riuscita. [NotAllowedError: Document is not focused.]')
  })

  it('non ripete un messaggio già presente nella frase', () => {
    const err = new Error('La chiave non c’è.')
    expect(withDetail('La chiave non c’è.', err)).toBe('La chiave non c’è.')
  })
})

describe('describeApiError', () => {
  it('il messaggio del server vince, senza aggiunte', () => {
    const err = axiosError({ response: { status: 403, data: { message: 'Link scaduto' } } })
    expect(describeApiError(err, 'ripiego')).toBe('Link scaduto')
  })

  it('senza messaggio del server il ripiego NON esce da solo', () => {
    const err = axiosError({ response: { status: 413, data: '<html>Payload Too Large</html>' } })
    expect(describeApiError(err, 'Caricamento non riuscito.')).toBe('Caricamento non riuscito. [HTTP 413 · POST /shared-links/abc/access]')
  })
})

describe('unexpectedResponse — un 200 che non contiene quello che serviva', () => {
  it('riconosce l’index.html del frontend al posto del JSON dell’API', () => {
    expect(unexpectedResponse('il link', '<!doctype html>\n<html lang="it">')).toMatch(/testo invece che con JSON.*punta forse al frontend/)
  })

  it('dice cosa è arrivato al posto di quello che mancava', () => {
    expect(unexpectedResponse('il link', { success: false })).toBe('Il server ha risposto senza il link [success: false, campi: success].')
  })

  it('se il server ha scritto un messaggio, mostra quello', () => {
    expect(unexpectedResponse('il link', { success: false, message: 'Quota superata' })).toBe('Quota superata')
  })
})
