<script setup lang="ts">
import { ref, watch } from 'vue'
import { Modal, message } from 'ant-design-vue'
import {
  ShareAltOutlined, MailOutlined, FileOutlined, SendOutlined, CloseOutlined,
  LinkOutlined, LockOutlined, ClockCircleOutlined, CopyOutlined, CheckOutlined,
} from '@ant-design/icons-vue'
import { useShareFile } from '@/src/composables/useShareFile'
import { useSharedLinks } from '@/src/composables/useSharedLinks'
import { useEncryptionStore } from '@/src/stores/encryption'
import type { DynamoDBFile } from '@/src/types'

const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || window.location.origin

const props = defineProps<{
  visible: boolean
  file: DynamoDBFile | null
  onClose: () => void
  onSuccess?: () => void
  onLinkGenerated?: () => void
}>()

const { shareFile, isSharing } = useShareFile()
const { createLink, isCreating } = useSharedLinks()
const encryptionStore = useEncryptionStore()

const email = ref('')
const emailError = ref('')
const generatedLink = ref('')
const linkCopied = ref(false)
const usePassword = ref(false)
const password = ref('')
const expiresInHours = ref<number>(168)
const maxDownloads = ref<number | null>(null)
const useMaxDownloads = ref(false)

const resetState = () => {
  email.value = ''
  emailError.value = ''
  generatedLink.value = ''
  linkCopied.value = false
  usePassword.value = false
  password.value = ''
  expiresInHours.value = 168
  maxDownloads.value = null
  useMaxDownloads.value = false
}

watch(() => props.visible, (v) => { if (!v) resetState() })

const validateEmail = (val: string) => {
  if (!val.trim()) { emailError.value = 'Email obbligatoria'; return false }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { emailError.value = 'Formato email non valido'; return false }
  emailError.value = ''
  return true
}

const handleEmailSubmit = async () => {
  if (!props.file || !validateEmail(email.value)) return
  await shareFile(props.file.s3Key, email.value.trim(), {
    onSuccess: () => {
      props.onClose()
      props.onSuccess?.()
    },
  })
}

const formatFileSize = (size: string | number): string => {
  if (typeof size === 'string') return size
  if (size === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(size) / Math.log(k))
  return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const handleGenerateLink = async () => {
  if (!props.file) return

  const encryptionData = await encryptionStore.getKey(props.file.s3Key)

  if (props.file.isEncrypted && !encryptionData) {
    const confirmed = await new Promise<boolean>(resolve => {
      Modal.confirm({
        title: 'Chiave di cifratura mancante',
        content: 'Questo file è cifrato (E2E) ma la chiave non è stata trovata. Il link permetterà di scaricare il file solo in formato cifrato. Vuoi procedere?',
        okText: 'Genera comunque',
        okButtonProps: { danger: true },
        cancelText: 'Annulla',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
    if (!confirmed) return
  }

  const link = await createLink(
    props.file.s3Key,
    props.file.fileName || props.file.originalName,
    typeof props.file.fileSize === 'string' ? props.file.fileSize : formatFileSize(props.file.fileSize),
    props.file.fileType,
    {
      password: usePassword.value ? password.value : undefined,
      expiresInHours: expiresInHours.value,
      maxDownloads: useMaxDownloads.value ? maxDownloads.value || undefined : undefined,
      encryptionKey: encryptionData?.key,
      encryptionIV: encryptionData?.iv,
    }
  )

  if (link) {
    const fullUrl = link.encryptedUrl || `${FRONTEND_URL}/share/${link.publicToken}`
    generatedLink.value = fullUrl
    encryptionData ? message.success('Link E2E cifrato generato!') : message.warning('Link generato senza chiavi.')
    props.onLinkGenerated?.()
  }
}

const handleCopyLink = () => {
  if (!generatedLink.value) return
  navigator.clipboard.writeText(generatedLink.value)
  linkCopied.value = true
  message.success('Link copiato negli appunti!')
  setTimeout(() => { linkCopied.value = false }, 2000)
}
</script>

<template>
  <a-modal
    :open="visible"
    :footer="null"
    :width="520"
    centered
    destroy-on-close
    :styles="{ content: { backgroundColor: '#2c2638', borderRadius: '16px', border: '1px solid #4a4554', padding: 0 }, header: { backgroundColor: '#2c2638', borderBottom: '1px solid #4a4554', padding: '20px 24px', borderRadius: '16px 16px 0 0' }, body: { backgroundColor: '#2c2638', padding: '24px' } }"
    @cancel="onClose"
  >
    <template #title>
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-[#724CF9] to-[#9d7bfa] flex items-center justify-center">
          <ShareAltOutlined class="!text-white text-lg" />
        </div>
        <div>
          <h3 class="text-white text-lg font-semibold m-0">Condividi File</h3>
          <p class="text-[#9ca3af] text-xs m-0">Invia o genera un link condivisibile</p>
        </div>
      </div>
    </template>
    <template #closeIcon><CloseOutlined class="!text-[#9ca3af] hover:!text-white" /></template>

    <div v-if="file" class="space-y-6">
      <!-- File preview -->
      <div class="bg-gradient-to-r from-[#1a1625] to-[#2c2638] border border-[#4a4554] rounded-xl p-4">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-lg bg-[#724CF9] flex items-center justify-center flex-shrink-0">
            <FileOutlined class="!text-white text-xl" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-white font-medium truncate mb-1">{{ decodeURIComponent(file.fileName || file.originalName) }}</p>
            <div class="flex items-center gap-3 text-sm text-[#9ca3af]">
              <span>{{ formatFileSize(file.fileSize || file.formattedSize) }}</span>
              <span class="w-1 h-1 rounded-full bg-[#4a4554]" />
              <span class="truncate">{{ file.fileType }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Email form -->
      <div class="space-y-4">
        <div>
          <label class="text-[#DBD4D3] font-medium text-sm mb-2 block">Email del destinatario</label>
          <div class="relative">
            <MailOutlined class="absolute left-3 top-1/2 -translate-y-1/2 !text-[#724CF9] z-10" />
            <input
              v-model="email"
              type="email"
              placeholder="esempio@email.com"
              :disabled="isSharing"
              class="w-full p-3 pl-10 rounded-lg focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#1a1625] border border-[#4a4554] placeholder:text-[#676178] text-white disabled:opacity-50"
              @blur="validateEmail(email)"
            />
          </div>
          <p v-if="emailError" class="text-[#F4743B] mt-1 text-sm">{{ emailError }}</p>
        </div>
        <div class="bg-[#1a1625] border border-[#4a4554] rounded-xl p-4">
          <p class="text-[#9ca3af] text-sm m-0">
            <span class="text-[#724CF9] font-medium">ℹ️ Nota:</span> Il destinatario deve essere un utente registrato sulla piattaforma.
          </p>
        </div>
        <div class="flex justify-end">
          <a-button
            type="primary"
            :loading="isSharing"
            :disabled="!email.trim() || !!emailError || isSharing"
            size="large"
            style="border-radius: 10px; height: 44px; padding: 0 24px"
            class="!bg-[#724CF9] hover:!bg-[#9d7bfa] !text-white !border-[#724CF9]"
            @click="handleEmailSubmit"
          >
            <template #icon><SendOutlined v-if="!isSharing" /></template>
            {{ isSharing ? 'Invio...' : 'Invia al destinatario' }}
          </a-button>
        </div>
      </div>

      <!-- Divider -->
      <div class="flex items-center gap-2">
        <div class="h-px bg-[#4a4554] flex-1" />
        <span class="text-[#9ca3af] text-xs uppercase tracking-wider">Oppure genera un link</span>
        <div class="h-px bg-[#4a4554] flex-1" />
      </div>

      <!-- Link generation -->
      <div class="space-y-4">
        <div class="bg-[#1a1625] border border-[#4a4554] rounded-xl p-4 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <LockOutlined class="!text-[#724CF9]" />
              <span class="text-[#DBD4D3] text-sm">Proteggi con password</span>
            </div>
            <a-switch v-model:checked="usePassword" />
          </div>
          <a-input-password v-if="usePassword" v-model:value="password" placeholder="Inserisci password" class="!bg-[#2c2638] !border-[#4a4554] !text-white" />

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <ClockCircleOutlined class="!text-[#724CF9]" />
              <span class="text-[#DBD4D3] text-sm">Scadenza (ore)</span>
            </div>
            <a-input-number v-model:value="expiresInHours" :min="1" :max="720" class="!w-24 !bg-[#2c2638] !border-[#4a4554]" />
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-[#724CF9]">📥</span>
              <span class="text-[#DBD4D3] text-sm">Limite download</span>
            </div>
            <a-switch v-model:checked="useMaxDownloads" />
          </div>
          <a-input-number v-if="useMaxDownloads" v-model:value="maxDownloads" :min="1" :max="1000" placeholder="Max download" class="w-full !bg-[#2c2638] !border-[#4a4554]" />
        </div>

        <div v-if="generatedLink" class="flex gap-2">
          <div class="relative flex-1">
            <LinkOutlined class="absolute left-3 top-1/2 -translate-y-1/2 !text-[#724CF9] z-10" />
            <input
              :value="generatedLink"
              readonly
              type="text"
              class="w-full p-3 pl-10 rounded-lg bg-[#1a1625] border border-[#4a4554] text-white cursor-text text-sm"
              @click="($event.target as HTMLInputElement).select()"
            />
          </div>
          <a-button
            :class="linkCopied ? '!bg-green-600 !border-green-600 !text-white' : '!bg-[#724CF9] !border-[#724CF9] !text-white'"
            style="height: 46px; border-radius: 8px"
            @click="handleCopyLink"
          >
            <template #icon><CheckOutlined v-if="linkCopied" /><CopyOutlined v-else /></template>
            {{ linkCopied ? 'Copiato!' : 'Copia' }}
          </a-button>
        </div>

        <a-button
          :loading="isCreating"
          :disabled="isCreating || (usePassword && !password)"
          size="large"
          style="border-radius: 10px; height: 48px"
          class="w-full !bg-[#2c2638] !border-[#724CF9] !text-[#724CF9] hover:!bg-[#724CF9] hover:!text-white"
          @click="handleGenerateLink"
        >
          <template #icon><LinkOutlined /></template>
          {{ generatedLink ? 'Rigenera Link' : 'Genera Link Condivisibile' }}
        </a-button>
      </div>

      <div class="flex justify-end pt-2">
        <a-button
          :disabled="isSharing || isCreating"
          size="large"
          style="border-radius: 10px; height: 44px; padding: 0 24px"
          class="!bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!border-[#724CF9] hover:!text-white"
          @click="onClose"
        >Chiudi</a-button>
      </div>
    </div>
  </a-modal>
</template>
