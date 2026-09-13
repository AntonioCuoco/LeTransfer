import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Le regole della cartella (README §9), **controllate** invece che solo scritte.
 *
 * Cosa difendono questi test: il nucleo che gira fuori dal browser (roadmap O3.1). Basta un
 * `import` dallo store o un `document.` scappato in un file del nucleo, e il client desktop o
 * la CLI non si caricano più — scoprendolo solo il giorno in cui qualcuno li scrive.
 */

const here = dirname(fileURLToPath(import.meta.url))
const sources = readdirSync(here).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))

/** Gli adattatori del browser: gli unici autorizzati a toccare DOM e IndexedDB. */
const BROWSER_ADAPTERS = new Set(['browserDownload.ts', 'keyStore.ts'])
/** L'unica libreria esterna, eccezione dichiarata in README §9. */
const ALLOWED_PACKAGES = ['@noble/post-quantum/']

const read = (file: string) => readFileSync(join(here, file), 'utf8')
const importsOf = (code: string) =>
  [...code.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1] ?? match[2])

describe('confini del nucleo crittografico', () => {
  it.each(sources)('%s importa solo dalla cartella o dall’unica libreria dichiarata', (file) => {
    for (const specifier of importsOf(read(file))) {
      const allowed = specifier.startsWith('./') || ALLOWED_PACKAGES.some((pkg) => specifier.startsWith(pkg))
      expect(allowed, `${file} importa «${specifier}»`).toBe(true)
    }
  })

  it.each(sources.filter((file) => !BROWSER_ADAPTERS.has(file)))('%s non tocca DOM né storage del browser', (file) => {
    expect(read(file)).not.toMatch(/\b(window|document|indexedDB|localStorage|sessionStorage)\s*[.(]/)
  })

  it('il nucleo si carica in Node, senza browser', async () => {
    expect(typeof window).toBe('undefined')

    const core = await import('./index')

    expect(typeof core.decryptToSink).toBe('function')
    expect(typeof core.wrapFileKeyForRecipient).toBe('function')
    expect(typeof core.memoryKeyStorage).toBe('function')
  })
})
