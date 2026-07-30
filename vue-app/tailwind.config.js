/*
 * ⚠️ File NON attivo — Tailwind v4 non lo legge.
 *
 * Con Tailwind v4 (plugin @tailwindcss/vite) la configurazione vive nel CSS: un file
 * JS viene caricato solo se lo si richiama esplicitamente con la direttiva `@config`,
 * che in `src/index.css` non c'è. Questo file restava qui dalla v3 e diceva il falso:
 * il colore `customBackground` non è mai esistito come utility.
 *
 * 👉 I token del design system stanno in `src/assets/tokens.css`, nel blocco `@theme`:
 *    è da lì che Tailwind genera le utility (bg-brand-500, text-verified-400,
 *    rounded-card, shadow-card…) e da lì che PrimeVue prende la palette (theme/preset.ts).
 *
 * Tenuto vuoto di proposito: se un domani si tornasse a una config JS, questo è il posto.
 */
export default {}
