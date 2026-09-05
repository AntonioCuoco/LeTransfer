import { describe, it, expect } from 'vitest'
import { parsePlanLimitError } from './planLimitError'

/**
 * I tre limiti del piano, distinti.
 *
 * Perché meritano test: un messaggio sbagliato **sembra** un messaggio. Se a chi ha finito
 * lo spazio diciamo «il file è troppo grande», lui rimpicciolisce il file, riprova, fallisce
 * di nuovo, e non capisce — e nel frattempo gli abbiamo proposto di comprare la cosa che non
 * gli serve. Non è un errore che si vede nei log: si vede nei ticket di supporto.
 */

const err = (status: number, data?: Record<string, unknown>) => ({ response: { status, data } })

describe('parsePlanLimitError', () => {
  it('non reclama errori che non sono suoi', () => {
    expect(parsePlanLimitError(err(500))).toBeNull()
    expect(parsePlanLimitError(err(403, { errorCode: 'CAPTCHA_FAILED' }))).toBeNull()
    expect(parsePlanLimitError(new Error('rete giù'))).toBeNull()
  })

  it('file troppo grande: dice il massimo e propone l’upgrade', () => {
    const parsed = parsePlanLimitError(err(413, {
      errorCode: 'FILE_TOO_LARGE',
      maxBytes: 2e9,
    }))!
    expect(parsed.code).toBe('FILE_TOO_LARGE')
    expect(parsed.suggestsUpgrade).toBe(true)
    expect(parsed.message).toContain('2 GB')
  })

  it('quota piena: dice quanto resta e quanto serve, non "file troppo grande"', () => {
    const parsed = parsePlanLimitError(err(413, {
      errorCode: 'QUOTA_EXCEEDED',
      limitBytes: 10e9,
      usedBytes: 9e9,
      remainingBytes: 1e9,
      requiredBytes: 3e9,
    }))!
    expect(parsed.code).toBe('QUOTA_EXCEEDED')
    // L'informazione che serve è lo spazio libero: dice quanto liberare.
    expect(parsed.message).toContain('1 GB')
    expect(parsed.message).toContain('3 GB')
    expect(parsed.message).toMatch(/libera spazio/i)
    // E soprattutto NON deve dire che il file è troppo grande: potrebbe essere minuscolo.
    expect(parsed.message).not.toMatch(/supera il massimo/i)
  })

  it('tetto mensile: dice quando riparte e NON propone di pagare', () => {
    const parsed = parsePlanLimitError(err(413, {
      errorCode: 'MONTHLY_LIMIT_EXCEEDED',
      limitBytes: 10e9,
      remainingBytes: 5e8,
      requiredBytes: 2e9,
      resetsAt: '2026-10-01T00:00:00.000Z',
    }))!
    expect(parsed.code).toBe('MONTHLY_LIMIT_EXCEEDED')
    expect(parsed.message).toContain('1 ottobre')
    // Il volume torna da solo: proporre un acquisto quando basta aspettare è il modo
    // migliore per farsi ricordare male.
    expect(parsed.suggestsUpgrade).toBe(false)
  })

  it('regge i dettagli mancanti senza inventare numeri', () => {
    const quota = parsePlanLimitError(err(413, { errorCode: 'QUOTA_EXCEEDED' }))!
    expect(quota.message).toMatch(/spazio/i)
    expect(quota.message).not.toContain('undefined')
    expect(quota.message).not.toContain('NaN')

    const monthly = parsePlanLimitError(err(413, { errorCode: 'MONTHLY_LIMIT_EXCEEDED' }))!
    expect(monthly.message).toMatch(/mese prossimo/i)
    expect(monthly.message).not.toContain('undefined')
  })

  it('una data di rinnovo malformata non produce "Invalid Date"', () => {
    const parsed = parsePlanLimitError(err(413, {
      errorCode: 'MONTHLY_LIMIT_EXCEEDED',
      resetsAt: 'non-una-data',
    }))!
    expect(parsed.message).not.toContain('Invalid')
  })

  it('un 413 senza codice non viene indovinato', () => {
    const parsed = parsePlanLimitError(err(413))!
    // Prima si assumeva FILE_TOO_LARGE. Una diagnosi sbagliata detta con sicurezza costa
    // più di una diagnosi mancante: qui si dice solo ciò che si sa.
    expect(parsed.code).toBeNull()
    expect(parsed.message).not.toMatch(/file/i)
    expect(parsed.message).toMatch(/limite del tuo piano/i)
  })

  it('riconosce il codice anche se lo stato non è 413', () => {
    // Il backend potrebbe cambiare stato senza cambiare semantica: il codice è il segnale.
    expect(parsePlanLimitError(err(400, { errorCode: 'QUOTA_EXCEEDED' }))?.code)
      .toBe('QUOTA_EXCEEDED')
  })
})
