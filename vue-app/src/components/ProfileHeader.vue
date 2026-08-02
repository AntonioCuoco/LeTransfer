<script setup lang="ts">
import { computed } from 'vue'
import { getCurrentUser } from '@/src/utils/getCurrentUser'
import { useProfileImage } from '@/src/composables/useProfileImage'

/**
 * Intestazione della pagina "I tuoi file" (roadmap F5).
 *
 * ⚠️ Qui c'era "Membro dal {{ joinDate }}" calcolato da `auth_time`, che nel token
 * Cognito è l'orario dell'**ultimo accesso**, non della registrazione: mostrava
 * quindi la data di oggi a chiunque. Nel token non esiste nessuna claim con la data
 * di iscrizione, quindi il dato è stato tolto invece che corretto — meglio niente
 * che un numero sbagliato.
 *
 * Rimpicciolita anche di parecchio: questa è la testata di uno spazio di lavoro,
 * non un profilo social. Prima occupava 300px e spingeva i file sotto la piega.
 */

const user = getCurrentUser()
const { profileImageUrl } = useProfileImage()

const initials = computed(() => {
  const parts = (user?.name || '').split(' ').filter(Boolean)
  return parts.map((part) => part[0]).join('').toUpperCase().slice(0, 2) || '?'
})
</script>

<template>
  <header class="border-b border-white/10 bg-white/[0.02] px-8 py-6">
    <div class="flex items-center gap-4">
      <div class="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-full border-2 border-brand-500/60 bg-white/[0.06]">
        <img v-if="profileImageUrl" :src="profileImageUrl" alt="" class="h-full w-full object-cover" />
        <span v-else class="text-lg font-bold text-haze-100">{{ initials }}</span>
      </div>

      <div class="min-w-0">
        <h1 class="m-0 truncate text-2xl font-bold tracking-[-0.02em] text-haze-100">
          {{ user?.name || user?.username || 'Il tuo spazio' }}
        </h1>
        <p v-if="user?.email" class="m-0 mt-0.5 truncate font-mono text-[0.8rem] text-haze-400">{{ user.email }}</p>
      </div>
    </div>
  </header>
</template>
