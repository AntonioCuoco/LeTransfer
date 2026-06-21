<script setup lang="ts">
import { useRouter, RouterLink } from 'vue-router'
import Cookies from 'js-cookie'
import Swal from 'sweetalert2'
import axios from 'axios'
import logo from '@/src/assets/logo.png'

const router = useRouter()

// `exact: true` for the home route — otherwise `/` matches every path as a
// prefix and the Home item would stay highlighted on every page.
const navItems = [
  { path: '/', icon: 'pi pi-home', label: 'Home', exact: true },
  { path: '/profile', icon: 'pi pi-user', label: 'Profilo', exact: false },
]

const handleLogout = async () => {
  try {
    await axios.post(`${import.meta.env.VITE_API_URL}/logout`, {}, {
      headers: { Authorization: `Bearer ${Cookies.get('idToken')}` },
    })
  } catch {
    // continue with logout even if API call fails
  }

  Cookies.remove('accessToken')
  Cookies.remove('idToken')
  Cookies.remove('refreshToken')

  Swal.fire({ icon: 'success', title: 'Logout effettuato', text: 'A presto!', timer: 1500, showConfirmButton: false })
  router.push('/login')
}
</script>

<template>
  <aside class="fixed left-0 top-0 h-screen w-[72px] bg-[#3c364c] border-r border-[#4a4554]/50 flex flex-col items-center justify-between py-4 px-2 z-50">
    <!-- Logo -->
    <div class="mb-8">
      <RouterLink to="/" class="w-14 h-14 flex items-center justify-center rounded-[10px] hover:scale-105 transition-transform">
        <img :src="logo" alt="Logo" />
      </RouterLink>
    </div>

    <!-- Navigation -->
    <nav class="flex flex-col items-center gap-2 w-full">
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        v-slot="{ isActive, isExactActive }"
        custom
      >
        <a
          :href="item.path"
          :class="[
            'relative w-full h-12 flex items-center justify-center rounded-[10px] transition-all duration-150 group',
            (item.exact ? isExactActive : isActive)
              ? 'bg-[#724CF9] text-white shadow-[0_0_10px_rgba(114,76,249,0.4)]'
              : 'text-[#9ca3af] hover:bg-[#724CF9]/15 hover:text-white',
          ]"
          :title="item.label"
          @click.prevent="router.push(item.path)"
        >
          <i :class="item.icon" class="text-xl" />
          <!-- Tooltip -->
          <span class="absolute left-[calc(100%+12px)] bg-[#3c364c] text-white py-2 px-3 rounded-md text-sm font-medium whitespace-nowrap opacity-0 invisible -translate-x-1 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0 transition-all duration-150 pointer-events-none shadow-md z-[1000] before:content-[''] before:absolute before:right-full before:top-1/2 before:-translate-y-1/2 before:border-[6px] before:border-transparent before:border-r-[#3c364c]">
            {{ item.label }}
          </span>
        </a>
      </RouterLink>
    </nav>

    <!-- Bottom Actions -->
    <div class="flex flex-col items-center gap-2 w-full pt-4">
      <button
        class="relative w-full h-12 flex items-center justify-center rounded-[10px] text-[#9ca3af] hover:bg-[#724CF9]/15 hover:text-white transition-all duration-150 group"
        title="Impostazioni"
        @click="router.push('/settings')"
      >
        <i class="pi pi-cog text-xl" />
        <span class="absolute left-[calc(100%+12px)] bg-[#3c364c] text-white py-2 px-3 rounded-md text-sm font-medium whitespace-nowrap opacity-0 invisible -translate-x-1 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0 transition-all duration-150 pointer-events-none shadow-md z-[1000] before:content-[''] before:absolute before:right-full before:top-1/2 before:-translate-y-1/2 before:border-[6px] before:border-transparent before:border-r-[#3c364c]">
          Impostazioni
        </span>
      </button>
      <button
        class="relative w-full h-12 flex items-center justify-center rounded-[10px] text-[#9ca3af] hover:bg-red-500/15 hover:text-red-500 transition-all duration-150 group"
        title="Logout"
        @click="handleLogout"
      >
        <i class="pi pi-sign-out text-xl" />
        <span class="absolute left-[calc(100%+12px)] bg-[#3c364c] text-white py-2 px-3 rounded-md text-sm font-medium whitespace-nowrap opacity-0 invisible -translate-x-1 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0 transition-all duration-150 pointer-events-none shadow-md z-[1000] before:content-[''] before:absolute before:right-full before:top-1/2 before:-translate-y-1/2 before:border-[6px] before:border-transparent before:border-r-[#3c364c]">
          Logout
        </span>
      </button>
    </div>
  </aside>
</template>
