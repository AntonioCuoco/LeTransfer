<script setup lang="ts">
const props = defineProps<{
  fileName: string
  fileSize: string
  fileType: string
  previewUrl?: string
  previewSupported?: boolean
  isDownloading?: boolean
  isDecrypting?: boolean
  onDownload?: () => void
  onPreview?: () => void
}>()

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return 'pi pi-image'
  if (type === 'application/pdf') return 'pi pi-file-pdf'
  if (type.startsWith('video/')) return 'pi pi-video'
  if (type.startsWith('audio/')) return 'pi pi-volume-up'
  if (type.startsWith('text/') || type.includes('document')) return 'pi pi-file-edit'
  return 'pi pi-file'
}

const supportsInlinePreview = (type: string) =>
  type.startsWith('image/') || type === 'application/pdf' || type.startsWith('video/') || type.startsWith('audio/')

const canPreview = () => props.previewSupported && props.previewUrl && supportsInlinePreview(props.fileType)
</script>

<template>
  <div class="bg-gradient-to-r from-[#1a1625] to-[#2c2638] border border-[#4a4554] rounded-xl overflow-hidden">
    <div v-if="canPreview()" class="relative bg-black/30 aspect-video flex items-center justify-center">
      <img v-if="fileType.startsWith('image/')" :src="previewUrl" :alt="fileName" class="max-w-full max-h-full object-contain" />
      <iframe v-else-if="fileType === 'application/pdf'" :src="previewUrl" :title="fileName" class="w-full h-full min-h-[300px]" />
      <video v-else-if="fileType.startsWith('video/')" :src="previewUrl" controls class="max-w-full max-h-full" />
      <audio v-else-if="fileType.startsWith('audio/')" :src="previewUrl" controls class="w-full max-w-md" />
    </div>

    <div class="p-6">
      <div class="flex items-center gap-4 mb-6">
        <div class="w-14 h-14 rounded-xl bg-[#724CF9]/20 flex items-center justify-center flex-shrink-0">
          <i :class="getFileIcon(fileType)" class="text-primary text-3xl" />
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-white truncate">{{ fileName }}</p>
          <p class="text-[#9ca3af] text-sm">{{ fileSize }} · {{ fileType }}</p>
        </div>
      </div>

      <div class="flex gap-3">
        <Button
          v-if="canPreview() && onPreview"
          label="Anteprima"
          icon="pi pi-eye"
          severity="secondary"
          outlined
          size="large"
          class="flex-1"
          @click="onPreview"
        />
        <Button
          :label="isDecrypting ? 'Decifratura...' : isDownloading ? 'Download...' : 'Scarica'"
          :icon="(isDownloading || isDecrypting) ? undefined : 'pi pi-download'"
          :loading="isDownloading || isDecrypting"
          :disabled="isDownloading || isDecrypting"
          size="large"
          class="flex-1"
          @click="onDownload"
        />
      </div>
    </div>
  </div>
</template>
