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
 * - dark `surface` → i grigi-viola della dashboard (token `shell-*`).
 *
 * Le classi di default per componente stanno nel `pt` globale (vedi theme/pt.ts),
 * gli override per istanza usano la prop `:pt` sul componente.
 */
export const LeTransferPreset = definePreset(Aura, {
  semantic: {
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
        surface: {
          0: '#ffffff',
          50: '#f0edf5',
          100: '#dbd4d3',
          200: '#c5bdc5',
          300: '#a99ea6',
          400: '#8c7f8d',
          500: '#6b6070',
          600: '#524759',
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
