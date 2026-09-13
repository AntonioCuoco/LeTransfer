/**
 * Adattatore di storage delle chiavi (roadmap O3.1): **dove vivono le chiavi**.
 *
 * Il nucleo non sa se sotto c'è IndexedDB (browser), un file protetto (desktop), il portachiavi
 * del sistema (CLI) o una mappa in memoria (test): riceve un `KeyStorage` e basta. È una delle
 * due cose che legavano il nucleo al browser; l'altra è dove finiscono i byte decifrati
 * (`PlaintextSink`, in streamingDownload.ts).
 *
 * ⚠️ Contratto: i valori tornano **come sono stati salvati**, `CryptoKey` native comprese. Nel
 * browser è lo structured clone di IndexedDB a conservarle senza esportarle, quindi una chiave
 * non estraibile resta tale. Un'implementazione che dovesse serializzare (JSON, file) deve
 * **rifiutare** le chiavi non estraibili, mai esportarle di nascosto.
 */
export interface KeyStorage {
  get<T>(name: string): Promise<T | undefined>
  set(name: string, value: unknown): Promise<void>
  delete(name: string): Promise<void>
}

/** In memoria: per Node, test e processi brevi. Sparisce con il processo. */
export function memoryKeyStorage(): KeyStorage {
  const values = new Map<string, unknown>()
  return {
    get: async <T>(name: string) => values.get(name) as T | undefined,
    set: async (name, value) => { values.set(name, value) },
    delete: async (name) => { values.delete(name) },
  }
}
