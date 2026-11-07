<script setup lang="ts">
import { onMounted } from 'vue'
import { REGISTRATION_OPEN, REGISTRATION_CLOSED_MESSAGE } from '@/src/utils/registration'
import { registerUrl } from '@/src/utils/novrenId'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import novrenIcon from '@/src/assets/novren-icon.png'

/**
 * La registrazione è di **Novren ID**: un account per Novren, NovrenPass e Novren Drive. Con la
 * registrazione aperta questa pagina porta là; chiusa, lo dice.
 */

const url = registerUrl()
onMounted(() => {
  if (REGISTRATION_OPEN) window.location.replace(url)
})
</script>

<template>
  <PublicShell :show-nav="false">
    <div class="grid w-full flex-1 place-items-center py-[clamp(26px,8vh,90px)]">
      <div class="lt-card w-[min(430px,100%)] p-6">
        <div class="mb-4 flex items-center gap-2.5 text-[1.04rem] font-bold tracking-[-0.01em]">
          <img :src="novrenIcon" alt="Novren" width="36" height="19" />
          {{ REGISTRATION_OPEN ? 'Ti portiamo su Novren ID…' : 'Registrazione chiusa' }}
        </div>
        <p class="text-[0.9rem] leading-snug text-[#6a5f8c]">
          {{ REGISTRATION_OPEN
            ? 'Gli account di Novren sono Novren ID: lo stesso per NovrenPass e Novren Drive.'
            : REGISTRATION_CLOSED_MESSAGE }}
        </p>
        <a v-if="REGISTRATION_OPEN" :href="url" class="lt-btn mt-4 inline-flex">Crea un Novren ID</a>
        <RouterLink v-else to="/login" class="lt-btn mt-4 inline-flex">Hai già un account? Accedi</RouterLink>
      </div>
    </div>
  </PublicShell>
</template>
