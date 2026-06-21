<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { notify } from '@/src/utils/notify'
import { usePublicLink } from '@/src/composables/usePublicLink'
import LinkAccessForm from '@/src/components/LinkAccess/LinkAccessForm.vue'
import FilePreviewCard from '@/src/components/LinkAccess/FilePreviewCard.vue'
import LinkExpiredError from '@/src/components/LinkAccess/LinkExpiredError.vue'
import { parseKeyFromHash, importKeyFromBase64, importIVFromBase64, decryptFile } from '@/src/utils/crypto'

type PageState = 'loading' | 'access_form' | 'authenticated' | 'error'

interface EncryptionInfo {
  key: CryptoKey
  iv: Uint8Array
}

const route = useRoute()
const publicToken = ref(route.params.publicToken as string)

const pageState = ref<PageState>('loading')
const isDownloading = ref(false)
const previewUrl = ref<string | null>(null)
const encryptionInfo = ref<EncryptionInfo | null>(null)
const isDecrypting = ref(false)

const { linkInfo, linkStatus, isLoading, error, getLinkInfo, accessLink, downloadFile } = usePublicLink()

const extractEncryptionKey = async (): Promise<EncryptionInfo | null> => {
  const keyData = parseKeyFromHash(window.location.hash)
  if (!keyData) return null
  try {
    const key = await importKeyFromBase64(keyData.key)
    const iv = importIVFromBase64(keyData.iv)
    return { key, iv }
  } catch {
    notify.error('Impossibile importare la chiave di cifratura')
    return null
  }
}

const loadLinkInfo = async () => {
  if (!publicToken.value) { pageState.value = 'error'; return }

  const encInfo = await extractEncryptionKey()
  if (encInfo) encryptionInfo.value = encInfo

  const info = await getLinkInfo(publicToken.value)
  pageState.value = info ? 'access_form' : 'error'
}

onMounted(loadLinkInfo)

const handleAccessSubmit = async (visitorName: string, password?: string) => {
  if (!publicToken.value) return
  const response = await accessLink(publicToken.value, { visitorName, password })
  if (response) {
    pageState.value = 'authenticated'
    if (response.previewSupported && !encryptionInfo.value) {
      const url = await downloadFile(publicToken.value, 'preview')
      if (url) previewUrl.value = url
    }
  }
}

const handleDownload = async () => {
  if (!publicToken.value) return
  isDownloading.value = true
  const url = await downloadFile(publicToken.value, 'download')
  if (url) {
    if (encryptionInfo.value) {
      isDecrypting.value = true
      try {
        const res = await fetch(url)
        const encryptedBlob = await res.blob()
        const decryptedBlob = await decryptFile(encryptedBlob, encryptionInfo.value.key, encryptionInfo.value.iv)
        const downloadUrl = URL.createObjectURL(decryptedBlob)
        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = linkInfo.value?.fileName || 'download'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(downloadUrl)
        notify.success('File decifrato e scaricato!')
      } catch {
        notify.error('Errore durante la decifratura del file')
      } finally {
        isDecrypting.value = false
      }
    } else {
      window.open(url, '_blank')
      notify.success('Download avviato!')
    }
  }
  isDownloading.value = false
}

const handlePreview = () => {
  if (previewUrl.value) window.open(previewUrl.value, '_blank')
}
</script>

<template>
  <LinkExpiredError v-if="pageState === 'error' || (linkStatus !== 'valid' && linkStatus !== 'loading')" :status="linkStatus" :message="error || undefined" />

  <div v-else-if="pageState === 'loading' || !linkInfo" class="min-h-screen bg-[#2c2638] flex items-center justify-center">
    <div class="text-center">
      <ProgressSpinner />
      <p class="text-[#9ca3af] mt-4">Caricamento...</p>
    </div>
  </div>

  <div v-else class="min-h-screen bg-[#2c2638] flex items-center justify-center p-4">
    <div class="max-w-lg w-full">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-white mb-2">
          le<span class="text-[#724CF9]">Transfer</span>
        </h1>
        <p class="text-[#9ca3af]">
          {{ pageState === 'access_form' ? 'Accedi per visualizzare il file condiviso' : 'File pronto per il download' }}
        </p>
      </div>

      <div class="bg-[#3c364c] border border-[#4a4554] rounded-2xl overflow-hidden">
        <div class="bg-gradient-to-r from-[#724CF9]/20 to-transparent p-6 border-b border-[#4a4554]">
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 rounded-xl bg-[#724CF9] flex items-center justify-center flex-shrink-0">
              <i class="pi pi-file text-white text-2xl" />
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="text-white font-semibold text-lg truncate" :title="linkInfo.fileName">{{ linkInfo.fileName }}</h2>
              <div class="flex items-center gap-3 text-sm text-[#9ca3af]">
                <span>{{ linkInfo.fileSize }}</span>
                <span class="w-1 h-1 rounded-full bg-[#4a4554]" />
                <span class="truncate">{{ linkInfo.fileType }}</span>
                <template v-if="linkInfo.isPasswordProtected">
                  <span class="w-1 h-1 rounded-full bg-[#4a4554]" />
                  <span class="flex items-center gap-1 text-[#724CF9]"><i class="pi pi-lock" /> Protetto</span>
                </template>
                <template v-if="encryptionInfo">
                  <span class="w-1 h-1 rounded-full bg-[#4a4554]" />
                  <span class="flex items-center gap-1 text-green-400"><i class="pi pi-shield" /> E2E Encrypted</span>
                </template>
              </div>
            </div>
          </div>
        </div>

        <div class="p-6">
          <LinkAccessForm
            v-if="pageState === 'access_form'"
            :is-password-protected="linkInfo.isPasswordProtected"
            :is-loading="isLoading"
            :error="error"
            @submit="handleAccessSubmit"
          />
          <FilePreviewCard
            v-else-if="pageState === 'authenticated'"
            :file-name="linkInfo.fileName"
            :file-size="linkInfo.fileSize"
            :file-type="linkInfo.fileType"
            :preview-url="previewUrl || undefined"
            :preview-supported="!!previewUrl"
            :is-downloading="isDownloading"
            :is-decrypting="isDecrypting"
            :on-download="handleDownload"
            :on-preview="handlePreview"
          />
        </div>
      </div>

      <div class="text-center mt-6">
        <p class="text-[#676178] text-sm">
          {{ linkInfo.ownerName ? `Condiviso da ${linkInfo.ownerName}` : 'File condiviso tramite leTransfer' }}
        </p>
      </div>
    </div>
  </div>
</template>
