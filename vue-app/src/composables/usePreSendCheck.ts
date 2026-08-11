import { ref, shallowRef } from 'vue'
import type { Finding } from '@/src/utils/fileInspection'

/**
 * Stato del controllo pre-invio (roadmap F1.5).
 *
 * Due scelte che stanno qui e non in `fileInspection.ts`:
 *
 * - **Caricamento pigro.** Il modulo di ispezione arriva con un `import()` dinamico, al
 *   primo file aggiunto: chi apre la facciata e legge soltanto non paga niente. Su una
 *   pagina che è il funnel di acquisizione, ogni kB dell'ingresso si vede.
 * - **Memoria dei risultati.** Aggiungere il quinto file non deve far rileggere i primi
 *   quattro. La chiave è nome+dimensione+data: due `File` diversi con gli stessi tre
 *   valori sono lo stesso file per qualunque uso pratico.
 *
 * Il risultato **non lascia mai il dispositivo**: nessuna chiamata di rete, qui dentro
 * o altrove, riceve questi dati.
 */
export function usePreSendCheck() {
  const findings = ref<Finding[]>([])
  const truncated = ref(false)
  const isChecking = ref(false)
  /** Conferma esplicita dell'utente sui rilievi gravi. */
  const acknowledged = ref(false)

  const cache = shallowRef(new Map<string, Finding[]>())

  function keyOf(file: File): string {
    const withPath = file as File & { webkitRelativePath?: string }
    return `${withPath.webkitRelativePath || file.name}|${file.size}|${file.lastModified}`
  }

  async function check(files: readonly File[]) {
    if (files.length === 0) {
      findings.value = []
      truncated.value = false
      acknowledged.value = false
      return
    }

    isChecking.value = true
    try {
      const { inspectFile, INSPECTION_FILE_LIMIT } = await import('@/src/utils/fileInspection')

      const subset = files.slice(0, INSPECTION_FILE_LIMIT)
      const results = await Promise.all(
        subset.map(async (file) => {
          const key = keyOf(file)
          const cached = cache.value.get(key)
          if (cached) return cached
          const result = await inspectFile(file)
          cache.value.set(key, result)
          return result
        }),
      )

      findings.value = results.flat()
      truncated.value = files.length > subset.length
      // Cambiare la selezione invalida la conferma: era riferita ad altri file.
      acknowledged.value = false
    } finally {
      isChecking.value = false
    }
  }

  function reset() {
    findings.value = []
    truncated.value = false
    acknowledged.value = false
    cache.value = new Map()
  }

  return { findings, truncated, isChecking, acknowledged, check, reset }
}
