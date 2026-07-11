<script setup lang="ts">
import { useRouter } from 'vue-router'
import axios from 'axios'
import { clearAuthCookies } from '@/src/utils/cookieStore'

const router = useRouter()

const handleLogout = async () => {
  try {
    // L'accessToken è iniettato dall'interceptor axios globale (vedi decisione #8).
    await axios.post(`${import.meta.env.VITE_API_URL}/auth/logout`, {})
  } catch {
    // continue with cookie removal even if the call fails
  }
  clearAuthCookies()
  router.push('/login')
}
</script>

<template>
  <div class="w-full h-fit">
    <header class="w-full h-fit p-4 px-2 sm:px-10 flex items-center justify-between">
      <p class="text-[#DBD4D3] text-4xl font-bold cursor-pointer" @click="router.push('/')">L.E</p>
      <div class="w-fit h-fit flex flex-row items-center gap-4">
        <button
          class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          @click="handleLogout"
        >
          Logout
        </button>
      </div>
    </header>
  </div>
</template>
