/**
 * PassThrough globale — la "pelle" PrimeVue del design system (roadmap F0.4).
 *
 * Ogni chiave è un componente (in minuscolo), ogni valore mappa le sue sezioni
 * interne a classi Tailwind. Quello che sta qui vale per **tutte** le istanze
 * dell'app; per un ritocco su un singolo componente si usa la prop `:pt` lì dove
 * serve, non una regola in più qui dentro.
 *
 * ⚠️ Cosa NON va qui: colori, raggi, durate, focus ring. Quelli sono **token** e
 * vivono in [preset.ts](preset.ts) → `assets/tokens.css`. Metterli anche qui
 * significherebbe due sorgenti per lo stesso angolo, che prima o poi divergono e
 * cominciano a litigare sulla specificità.
 *
 * Cosa va qui: la **voce tipografica**, che i token PrimeVue non esprimono —
 * il peso dei bottoni, e soprattutto il **mono** dove il testo è un dato tecnico
 * (intestazioni di tabella, chip, tooltip). È la stessa regola dei primitivi
 * `.lt-label` / `.lt-eyebrow`: mono = "questo è un fatto, non una frase".
 */
/**
 * Una sezione è una stringa di classi, oppure — per i componenti che ne annidano
 * altri (`pcInputText` dentro Password) — il `pt` del componente figlio.
 */
type PtSection = string | Record<string, string>

export const globalPt: Record<string, Record<string, PtSection>> = {
  // ── Azioni ──────────────────────────────────────────────────────────────────
  button: {
    // Stesso peso e stessa spaziatura di `.lt-btn`: un bottone PrimeVue e un bottone
    // a mano, affiancati, devono sembrare lo stesso oggetto.
    label: 'font-semibold tracking-[-0.01em]',
  },

  // ── Campi ───────────────────────────────────────────────────────────────────
  // Le password si rileggono carattere per carattere: mono, come le impronte.
  password: { pcInputText: { root: 'font-mono' } },
  inputnumber: { pcInputText: { root: 'font-mono tabular-nums' } },

  // ── Dati ────────────────────────────────────────────────────────────────────
  column: {
    // Le intestazioni di colonna sono etichette, non titoli: micro-mono maiuscolo,
    // identico a `.lt-label`.
    columnTitle: 'font-mono text-[0.64rem] font-semibold uppercase tracking-[0.14em]',
  },
  paginator: {
    root: 'font-mono text-[0.78rem]',
  },
  chip: {
    label: 'font-mono text-[0.74rem] tracking-[0.02em]',
  },

  // ── Sovrapposizioni ─────────────────────────────────────────────────────────
  dialog: {
    // I titoli dei dialoghi seguono la scala dei titoli, non quella del corpo.
    title: 'font-semibold tracking-[-0.02em]',
  },
  tooltip: {
    // Il tooltip nell'app spiega quasi sempre un dato (nome file intero, data,
    // stato di cifratura): mono e piccolo, come il dato che descrive.
    text: 'font-mono text-[0.74rem] leading-snug',
  },
  toast: {
    summary: 'font-semibold tracking-[-0.01em]',
    detail: 'text-[0.86rem] leading-relaxed',
  },

  // ── Progresso ───────────────────────────────────────────────────────────────
  progressbar: {
    // La firma del prodotto: viola → menta, la stessa rampa che accompagna la
    // cifratura nel widget d'invio. Il progresso qui *significa* qualcosa.
    value: 'bg-[linear-gradient(90deg,var(--color-brand-400),var(--color-verified-400))]',
    label: 'font-mono text-[0.72rem] font-semibold',
  },
}

export default globalPt
