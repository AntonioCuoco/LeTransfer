import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

/**
 * Tema PrimeVue di LeTransfer, costruito sopra il preset Aura.
 *
 * ⚠️ Nessun colore è definito QUI: i valori vengono da `assets/tokens.css` (roadmap F0.1),
 * referenziati come CSS custom properties. PrimeVue emette questi token come
 * `--p-primary-500: var(--color-brand-500)`, quindi cambiare la palette in tokens.css
 * aggiorna insieme utility Tailwind, CSS a mano e componenti PrimeVue.
 * Prima erano due scale gemelle da tenere allineate a mano: non esiste più il rischio.
 *
 * - `primary` → viola del brand: bottoni, link, focus ring…
 * - dark `surface` → le superfici della dashboard (token `haze-*` e `shell-*`).
 *
 * **Divisione del lavoro con [pt.ts](pt.ts)** (roadmap F0.4): qui stanno i *token* —
 * colore, raggio, motion, focus — perché un token si propaga da solo a tutti gli 80
 * componenti e non può entrare in conflitto con le classi di un'istanza. In `pt.ts`
 * sta solo ciò che un token non sa dire: la *voce* tipografica (peso, spaziatura,
 * mono per i dati tecnici). Gli override per singola istanza usano la prop `:pt`.
 */
export const LeTransferPreset = definePreset(Aura, {
  /**
   * Raggi: Aura fa derivare OGNI raggio (campi, pannelli, modali, chip…) da questa
   * scala primitiva. Riscriverla qui significa che i componenti PrimeVue prendono la
   * forma del design system in un colpo solo, senza una classe `rounded-*` per
   * componente in `pt.ts` — e senza il rischio che una utility Tailwind e un token
   * PrimeVue litighino sullo stesso angolo.
   */
  primitive: {
    borderRadius: {
      none: '0',
      // La nostra scala parte da 7px (`badge`): sotto, il design system non ha raggi.
      // Aura userebbe 2px e 4px per spunte e chip — troppo squadrati accanto a una
      // carta da 22px, così `xs` e `sm` collassano entrambi sul raggio più piccolo che abbiamo.
      xs: 'var(--radius-badge)',
      sm: 'var(--radius-badge)',
      md: 'var(--radius-field)',
      lg: 'var(--radius-control)',
      xl: 'var(--radius-panel)',
    },
  },
  semantic: {
    // La velocità delle transizioni dei componenti, dallo stesso token del CSS a mano.
    transitionDuration: 'var(--duration-quick)',

    /**
     * Anello di focus: 2px pieni nel viola del brand. Aura ne mette 1px — su un
     * prodotto dove si digitano password e impronte, chi naviga da tastiera deve
     * vedere *senza sforzo* dove si trova.
     */
    focusRing: {
      width: '2px',
      style: 'solid',
      color: 'var(--color-brand-500)',
      offset: '2px',
      shadow: 'none',
    },

    primary: {
      50: 'var(--color-brand-50)',
      100: 'var(--color-brand-100)',
      200: 'var(--color-brand-200)',
      300: 'var(--color-brand-300)',
      400: 'var(--color-brand-400)',
      500: 'var(--color-brand-500)',
      600: 'var(--color-brand-600)',
      700: 'var(--color-brand-700)',
      800: 'var(--color-brand-800)',
      900: 'var(--color-brand-900)',
      950: 'var(--color-brand-950)',
    },
    colorScheme: {
      dark: {
        /**
         * La scala `surface` scura. Metà di questi valori erano grigi scritti a
         * mano qui dentro (#8c7f8d, #6b6070, #524759…) — in violazione della
         * regola in cima al file, e con un difetto visibile: neutri o addirittura
         * caldi (#dbd4d3 tirava al beige) dentro un'interfaccia viola. È da lì che
         * veniva il grigio del campo disabilitato e delle intestazioni di tabella.
         *
         * Ora l'intera scala viene dai token: `haze` per l'estremità chiara
         * (testi e bordi sopra il fondo scuro), `shell` per le superfici.
         */
        surface: {
          0: '#ffffff',
          50: 'var(--color-haze-100)',
          100: 'var(--color-haze-200)',
          200: 'var(--color-haze-300)',
          300: 'var(--color-haze-400)',
          400: 'var(--color-haze-500)',
          500: 'var(--color-shell-500)',
          600: 'var(--color-shell-600)',
          700: 'var(--color-shell-700)',
          800: 'var(--color-shell-800)',
          900: 'var(--color-shell-900)',
          950: 'var(--color-shell-950)',
        },
      },
    },
  },
})

export default LeTransferPreset
