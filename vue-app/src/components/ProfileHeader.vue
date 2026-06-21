<script setup lang="ts">
import { getCurrentUser } from '@/src/utils/getCurrentUser'
import { useProfileImage } from '@/src/composables/useProfileImage'

const user = getCurrentUser()
const { profileImageUrl } = useProfileImage()

const initials = () => {
  const parts = (user?.name || '').split(' ')
  return parts.map((p: string) => p[0]).join('').toUpperCase().slice(0, 2) || '?'
}

const joinDate = user?.auth_time
  ? new Date(user.auth_time * 1000).toLocaleDateString('it-IT')
  : 'Data sconosciuta'
</script>

<template>
  <div class="relative bg-gradient-to-b from-[#2c2638] to-[#3c364c] min-h-[300px] flex flex-col items-center justify-center p-8">
    <div class="absolute inset-0 opacity-5" style="background: linear-gradient(135deg, #724CF9, transparent)" />
    <div class="relative z-10 flex flex-col items-center space-y-6">
      <div class="w-32 h-32 rounded-full overflow-hidden border-4 border-[#724CF9] shadow-lg flex items-center justify-center bg-[#3c364c]">
        <img v-if="profileImageUrl" :src="profileImageUrl" alt="Profile" class="w-full h-full object-cover" />
        <span v-else class="text-white text-3xl font-bold">{{ initials() }}</span>
      </div>
      <div class="text-center space-y-2">
        <h1 class="text-3xl font-bold text-white">
          {{ user?.name || user?.username || 'Utente' }}
        </h1>
        <p class="text-[#DBD4D3]">{{ user?.email }}</p>
        <p class="text-sm text-[#DBD4D3]">Membro dal {{ joinDate }}</p>
      </div>
    </div>
  </div>
</template>
