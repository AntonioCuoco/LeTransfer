/**
 * Build della CLI: un unico file, `dist/novren.mjs`, senza dipendenze a runtime.
 *
 * esbuild e non `tsc`: la CLI importa il nucleo crittografico direttamente dai sorgenti di
 * `vue-app/src/crypto/`, che usa import senza estensione — validi per un bundler, rifiutati
 * da Node puro. Impacchettare risolve il problema alla radice e dà un file solo da
 * distribuire, con dentro esattamente il codice che cifra, e nient'altro.
 *
 * Una sola implementazione della crittografia per sito e CLI: non una copia. Un file cifrato
 * dalla CLI si apre nel browser perché è letteralmente lo stesso codice.
 */
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/novren.mjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  banner: { js: '#!/usr/bin/env node' },
  define: { __NOVREN_CLI_VERSION__: JSON.stringify(version) },
  // Leggibile di proposito: chi installa uno strumento crittografico deve poter aprire il
  // file e leggerlo. Minificare risparmierebbe pochi KB e toglierebbe proprio quello.
  minify: false,
  legalComments: 'inline',
  logLevel: 'warning',
})
