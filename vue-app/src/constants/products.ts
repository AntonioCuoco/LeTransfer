/**
 * Gli altri prodotti Novren, mostrati nel menu «Prodotti» della barra laterale.
 *
 * Una voce senza `href` è **in arrivo**: il menu mostra «Coming soon» e un sigillo sfocato,
 * senza nome né logo — il nome resta qui solo per il giorno del lancio. Quando un prodotto
 * esce si aggiungono `href` e `logo` a questa voce, e il menu lo mostra come link: non c'è
 * altro da toccare.
 */
export interface NovrenProduct {
  id: string
  name: string
  /** Una riga su cosa fa, mostrata sotto il nome quando il prodotto è uscito. */
  tagline?: string
  /** Assente finché il prodotto non è pubblico. */
  href?: string
  /** URL del logo (un import da `@/src/assets/...`). */
  logo?: string
}

export const NOVREN_PRODUCTS: NovrenProduct[] = [
  { id: 'pass', name: 'Novren Pass' },
]
