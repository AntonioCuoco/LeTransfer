<script setup lang="ts">
import SettingsSection from './SettingsSection.vue'
</script>

<template>
  <div class="flex flex-col gap-4">
    <SettingsSection title="Integrazioni" description="Collega strumenti esterni a Novren" icon="pi pi-link">
      <div class="py-8 text-center">
        <p class="m-0 font-semibold text-haze-100">Non ce ne sono ancora.</p>
        <p class="m-0 mx-auto mt-2 max-w-[52ch] text-sm leading-relaxed text-haze-400">
          Ogni integrazione con un servizio esterno è codice di terzi vicino ai tuoi file: le
          aggiungeremo una alla volta, e solo dove non serve consegnargli niente in chiaro.
        </p>
      </div>
    </SettingsSection>
  </div>
</template>
