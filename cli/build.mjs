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
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const { version } = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))

const result = await build({
  absWorkingDir: here,
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
  metafile: true,
})

// ── Licenze, dentro il pacchetto ─────────────────────────────────────────────
//
// Il bundle contiene codice con tre licenze diverse, e ognuna chiede che il suo testo
// viaggi con le copie distribuite:
//   • la CLI                          → FSL-1.1-ALv2 (../LICENSE)
//   • il nucleo crittografico         → Apache 2.0   (vue-app/src/crypto/LICENSE)
//   • le dipendenze impacchettate     → la loro (oggi solo client-zip, MIT)
//
// L'elenco delle dipendenze si ricava da ciò che esbuild ha DAVVERO messo nel bundle, non
// da package.json: una dipendenza nuova entra nelle note da sola, e se non ha un file di
// licenza il build si ferma invece di pubblicare codice altrui senza la sua nota.

copyFileSync(join(here, '../LICENSE'), join(here, 'dist/LICENSE'))

const inputs = Object.keys(result.metafile.inputs)
const notices = [
  'Novren CLI — licenze dei componenti inclusi in dist/novren.mjs.\n' +
    'La CLI è rilasciata sotto FSL-1.1-ALv2 (vedi LICENSE). Le parti elencate qui hanno la propria licenza.',
]

const cryptoFiles = inputs.filter((p) => p.startsWith('../vue-app/src/crypto/')).map((p) => p.replace('../vue-app/src/', ''))
notices.push(
  [
    '== Nucleo crittografico di Novren — Apache-2.0',
    `File: ${cryptoFiles.join(', ')}`,
    '',
    readFileSync(join(here, '../vue-app/src/crypto/LICENSE'), 'utf8').trim(),
  ].join('\n'),
)

const packages = new Map()
for (const input of inputs) {
  const at = input.lastIndexOf('node_modules/')
  if (at === -1) continue
  const parts = input.slice(at + 'node_modules/'.length).split('/')
  const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
  packages.set(name, join(here, input.slice(0, at), 'node_modules', name))
}
for (const [name, dir] of [...packages].sort()) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const licenseFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\..*)?$/i.test(f))
  if (!licenseFile) throw new Error(`${name}: nessun file di licenza, non lo si può impacchettare.`)
  notices.push(`== ${name}@${manifest.version} — ${manifest.license}\n\n${readFileSync(join(dir, licenseFile), 'utf8').trim()}`)
}

writeFileSync(join(here, 'dist/THIRD-PARTY-NOTICES.txt'), `${notices.join('\n\n\n')}\n`)
