<script setup lang="ts">
import { ref } from 'vue'
import { cn } from '@/src/utils/utils'
import img1 from '@/src/assets/img1.webp'
import img2 from '@/src/assets/img2.webp'
import img3 from '@/src/assets/img3.webp'

const indexImg = ref(1)
const images = [img1, img2, img3]
</script>

<template>
  <div class="relative h-full overflow-hidden">
    <div
      class="absolute inset-0 bg-cover bg-center top-[48px] right-[48px] bottom-[48px] left-[48px] rounded-4xl"
      :style="{ backgroundImage: `url(${images[indexImg - 1]})` }"
    />
    <div class="absolute inset-0 top-[48px] right-[48px] bottom-[48px] left-[48px] bg-black/40 rounded-4xl" />
    <div class="relative z-10 flex flex-col justify-between items-center p-16 w-full h-full">
      <h1 class="text-white font-bold text-5xl">LeTransfer</h1>
      <p class="flex flex-col gap-2 text-center text-white">
        <span class="font-normal text-2xl">Trasferisci i tuoi dati</span>
        <span class="font-normal text-2xl">In totale sicurezza</span>
      </p>
      <div class="flex flex-col gap-4 whitespace-nowrap">
        <div class="flex flex-row gap-4">
          <button
            v-for="n in 3"
            :key="n"
            :class="cn('w-10 h-1.5 bg-white text-black rounded-md', indexImg === n && 'bg-[#724CF9]')"
            @click="indexImg = n"
          />
        </div>
      </div>
    </div>
  </div>
</template>
