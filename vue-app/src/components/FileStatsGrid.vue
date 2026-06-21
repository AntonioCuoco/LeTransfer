<script setup lang="ts">
import type { FileStats } from '@/src/types'

defineProps<{ stats: FileStats }>()

const statsConfig = [
  { key: 'uploaded' as keyof FileStats, label: 'File Caricati', icon: 'pi pi-upload', color: 'text-blue-400', bg: 'bg-blue-900/30' },
  { key: 'downloaded' as keyof FileStats, label: 'File Scaricati', icon: 'pi pi-download', color: 'text-green-400', bg: 'bg-green-900/30' },
  { key: 'sent' as keyof FileStats, label: 'File Inviati', icon: 'pi pi-send', color: 'text-purple-400', bg: 'bg-purple-900/30' },
  { key: 'received' as keyof FileStats, label: 'File Ricevuti', icon: 'pi pi-inbox', color: 'text-orange-400', bg: 'bg-orange-900/30' },
  { key: 'archived' as keyof FileStats, label: 'File Archiviati', icon: 'pi pi-box', color: 'text-indigo-400', bg: 'bg-indigo-900/30' },
  { key: 'deleted' as keyof FileStats, label: 'File Eliminati', icon: 'pi pi-trash', color: 'text-red-400', bg: 'bg-red-900/30' },
]
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-8">
    <div
      v-for="item in statsConfig"
      :key="item.key"
      class="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 bg-[#3c364c] border border-[#4a4554]/30 rounded-xl p-6"
    >
      <div class="flex items-center space-x-4">
        <div :class="`p-3 rounded-xl ${item.bg} group-hover:scale-110 transition-transform duration-300 flex items-center justify-center`">
          <i :class="[item.icon, item.color]" />
        </div>
        <div>
          <p class="text-sm font-medium text-[#DBD4D3]">{{ item.label }}</p>
          <p class="text-2xl font-bold text-white">{{ stats[item.key].toLocaleString() }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
