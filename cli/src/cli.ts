import { main } from './main'

/**
 * L'ingresso eseguibile: chiama `main`, sempre.
 *
 * Separato da `main.ts` invece di un controllo «sono stato lanciato come programma?»: quel
 * controllo confronta `process.argv[1]` con il percorso del modulo, e fallisce quando npm
 * installa la CLI come link simbolico (`/usr/local/bin/novren` → `…/dist/novren.mjs`) —
 * la CLI installata partirebbe e non farebbe niente, senza errori. I test importano `main.ts`.
 */
main(process.argv.slice(2)).then((code) => {
  process.exitCode = code
})
