import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

/**
 * LeTransfer brand theme — built on top of PrimeVue's Aura preset.
 *
 * - `primary`  → brand purple (#724CF9 family), drives buttons, links, focus rings…
 * - dark `surface` → purple-gray scale matching the app background (#2c2638),
 *   so cards/inputs/tables render in our palette instead of Aura's default slate.
 *
 * Per-component default classes go in the global `pt` preset (see main.ts),
 * per-instance overrides use the `:pt` prop on the component itself.
 */
export const LeTransferPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f5f3ff',
      100: '#ede9fe',
      200: '#ddd6fe',
      300: '#c4b5fd',
      400: '#a78bfa',
      500: '#724cf9',
      600: '#5a30eb',
      700: '#4923d1',
      800: '#3b1ca7',
      900: '#2f1881',
      950: '#1c0d54',
    },
    colorScheme: {
      dark: {
        // Purple-gray surfaces that match the app shell (#2c2638 / #3c364c).
        surface: {
          0: '#ffffff',
          50: '#f0edf5',
          100: '#dbd4d3',
          200: '#c5bdc5',
          300: '#a99ea6',
          400: '#8c7f8d',
          500: '#6b6070',
          600: '#524759',
          700: '#4a4554',
          800: '#3c364c',
          900: '#2c2638',
          950: '#1e1a2a',
        },
      },
    },
  },
})

export default LeTransferPreset
