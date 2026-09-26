import { describe, it, expect } from 'vitest'
import { parseLink, InvalidLink } from '../src/link'

describe('link di un invio', () => {
  const token = 'Xk3pQ9aZbC4dEfGh1JkLm'

  it('legge token, chiave e iv', () => {
    expect(parseLink(`https://novren.net/share/${token}#key=abc-_&iv=def`)).toEqual({ publicToken: token, key: 'abc-_', iv: 'def' })
  })

  it('tagliato alla «&» da bash: la chiave c’è, l’iv no', () => {
    expect(parseLink(`https://novren.net/share/${token}#key=abc`)).toEqual({ publicToken: token, key: 'abc', iv: null })
  })

  it('senza frammento: nessuna chiave, ma il link è valido', () => {
    expect(parseLink(`https://novren.net/share/${token}`).key).toBeNull()
  })

  it('tollera spazi attorno e una barra finale', () => {
    expect(parseLink(`  https://novren.net/share/${token}/#key=k  `).publicToken).toBe(token)
  })

  it.each(['non un link', 'https://example.com/altro', 'https://novren.net/share/', 'https://novren.net/share/../../x'])(
    'rifiuta «%s»',
    (raw) => {
      expect(() => parseLink(raw)).toThrow(InvalidLink)
    },
  )
})
