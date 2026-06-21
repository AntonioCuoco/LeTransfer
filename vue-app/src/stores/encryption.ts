import { defineStore } from 'pinia'
import { shallowRef, ref } from 'vue'
import { notify } from '@/src/utils/notify'
import { wrapFileKey, unwrapFileKey, arrayBufferToBase64, base64ToArrayBuffer } from '@/src/utils/crypto'
import { useFileKeysAPI } from '@/src/composables/useFileKeysAPI'
import type { EncryptionKeyData } from '@/src/types'

export const useEncryptionStore = defineStore('encryption', () => {
  const masterKey = shallowRef<CryptoKey | null>(null)
  const isUnlocked = shallowRef(false)
  const keyCache = ref<Record<string, EncryptionKeyData>>({})

  const { saveFileKey, getFileKey, deleteFileKey } = useFileKeysAPI()

  function setMasterKey(key: CryptoKey) {
    masterKey.value = key
    isUnlocked.value = true
  }

  function clearMasterKey() {
    masterKey.value = null
    isUnlocked.value = false
    keyCache.value = {}
  }

  async function storeKey(s3Key: string, keyData: EncryptionKeyData): Promise<boolean> {
    if (!masterKey.value) {
      notify.error('Impossibile salvare la chiave: Master Key non disponibile')
      return false
    }
    try {
      const rawKey = base64ToArrayBuffer(keyData.key)
      const fileKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
      const { wrappedKey, wrapIV } = await wrapFileKey(fileKey, masterKey.value)
      const success = await saveFileKey({ s3Key, wrappedKey, fileIV: keyData.iv, wrapIV })
      if (success) keyCache.value = { ...keyCache.value, [s3Key]: keyData }
      return success
    } catch {
      notify.error('Errore nel salvataggio della chiave di cifratura')
      return false
    }
  }

  async function getKey(s3Key: string): Promise<EncryptionKeyData | null> {
    if (keyCache.value[s3Key]) return keyCache.value[s3Key]
    if (!masterKey.value) return null
    try {
      const wrappedData = await getFileKey(s3Key)
      if (!wrappedData) return null
      const fileKeyFn = await unwrapFileKey(wrappedData.wrappedKey, wrappedData.wrapIV, masterKey.value)
      const exportedRaw = await crypto.subtle.exportKey('raw', fileKeyFn)
      const keyData: EncryptionKeyData = { key: arrayBufferToBase64(exportedRaw), iv: wrappedData.fileIV }
      keyCache.value = { ...keyCache.value, [s3Key]: keyData }
      return keyData
    } catch {
      notify.error('Errore nel recupero della chiave di cifratura')
      return null
    }
  }

  async function removeKey(s3Key: string): Promise<void> {
    const next = { ...keyCache.value }
    delete next[s3Key]
    keyCache.value = next
    await deleteFileKey(s3Key)
  }

  function hasKey(s3Key: string): boolean {
    return !!keyCache.value[s3Key]
  }

  return { masterKey, isUnlocked, setMasterKey, clearMasterKey, storeKey, getKey, removeKey, hasKey }
})
