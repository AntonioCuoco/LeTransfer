import { describe, it, expect } from 'vitest'
import { HELP_ARTICLES, HELP_CATEGORIES, findArticle, searchArticles } from './help'

/**
 * Il centro assistenza. Cosa difende: i link che non si vedono rotti finché qualcuno non ci clicca.
 * L'app desktop rimanda a slug precisi (una volta installata, quel link non cambia più), e gli
 * articoli si rimandano fra loro.
 */

/** Gli slug a cui rimanda l'app desktop: non si rinominano mai. */
const LINKED_FROM_APPS = ['nearby-non-vede-dispositivi']
const PUBLIC_ROUTES = ['/prezzi', '/sicurezza', '/feedback', '/come-funziona', '/aiuto']

describe('centro assistenza', () => {
  it('gli slug sono unici e ogni articolo sta in una categoria che esiste', () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const categories = new Set(HELP_CATEGORIES.map((c) => c.id))
    for (const a of HELP_ARTICLES) expect(categories.has(a.category), a.slug).toBe(true)
  })

  it('gli slug usati dalle app esistono', () => {
    for (const slug of LINKED_FROM_APPS) expect(findArticle(slug), slug).toBeDefined()
  })

  it('ogni rimando porta a una pagina o a un articolo che esiste', () => {
    for (const a of HELP_ARTICLES) {
      for (const block of a.blocks) {
        if (block.type !== 'related') continue
        const ok = block.to.startsWith('/aiuto/') ? !!findArticle(block.to.slice('/aiuto/'.length)) : PUBLIC_ROUTES.includes(block.to)
        expect(ok, `${a.slug} → ${block.to}`).toBe(true)
      }
    }
  })

  it('i numeri dei piani arrivano dal catalogo, non restano segnaposto', () => {
    const text = JSON.stringify(HELP_ARTICLES)
    expect(text).not.toMatch(/undefined|NaN|\$\{/)
  })

  it('la ricerca ignora maiuscole e accenti, e mette prima chi ha la parola nel titolo', () => {
    expect(searchArticles('FIREWALL')[0]?.slug).toBe('nearby-non-vede-dispositivi')
    expect(searchArticles('perche non si apre').length).toBeGreaterThan(0)
    expect(searchArticles('24 parole')[0]?.slug).toBe('le-24-parole')
    expect(searchArticles('zzzz')).toEqual([])
    expect(searchArticles('   ')).toEqual([])
  })
})
