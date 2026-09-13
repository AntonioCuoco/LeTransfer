// Mini key-value store su IndexedDB per oggetti CryptoKey NATIVI.
//
// A differenza di localStorage, IndexedDB può conservare un CryptoKey come oggetto nativo
// (structured clone) senza esportarlo in JWK. Se la chiave è `extractable: false`, nemmeno un
// XSS può leggerne/esportarne il materiale grezzo: può al massimo usarla finché la sessione è
// viva. È il meccanismo alla base del fix #1 (private key RSA non più in localStorage in chiaro).
//
// Nessuna dipendenza esterna: wrapper minimale sull'API IndexedDB.
//
// Il valore può essere anche un record che CONTIENE una CryptoKey (es. la master key ricordata,
// con la sua scadenza — vedi rememberedDevice.ts): lo structured clone conserva la chiave
// nativa anche dentro un oggetto, con la stessa non-estraibilità.

import type { KeyStorage } from './storage'

const DB_NAME = 'letransfer-keys'
const STORE_NAME = 'keys'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function idbGet<T = CryptoKey>(key: string): Promise<T | undefined> {
  const db = await openDB()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve(req.result as T | undefined)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/** L'adattatore di storage del browser (O3.1, vedi storage.ts): questo stesso IndexedDB. */
export const indexedDbKeyStorage: KeyStorage = {
  get: (name) => idbGet(name),
  set: (name, value) => idbSet(name, value),
  delete: (name) => idbDel(name),
}

export async function idbDel(key: string): Promise<void> {
  const db = await openDB()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
