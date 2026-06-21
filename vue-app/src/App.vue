<script setup lang="ts">
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import { theme as antTheme } from 'ant-design-vue'
import { useThemeStore } from '@/src/stores/theme'

const themeStore = useThemeStore()

// Brand palette tokens — applied on top of Ant Design's dark algorithm.
// This is what makes tables/selects/modals/pickers render dark+branded out of
// the box, instead of fighting the default light theme with !important.
const darkTokens = {
  colorPrimary: '#724CF9',
  colorInfo: '#724CF9',
  colorBgBase: '#2c2638',
  colorBgContainer: '#3c364c',
  colorBgElevated: '#332d42',
  colorBgLayout: '#2c2638',
  colorBorder: '#4a4554',
  colorBorderSecondary: '#3a3447',
  colorText: '#DBD4D3',
  colorTextSecondary: '#9ca3af',
  colorTextTertiary: '#9ca3af',
  borderRadius: 8,
}

const themeConfig = computed(() => ({
  algorithm: themeStore.isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
  token: themeStore.isDark
    ? darkTokens
    : { colorPrimary: '#724CF9', colorInfo: '#724CF9', borderRadius: 8 },
  components: {
    // Tables blend into the card they sit on, with a subtle branded row hover.
    Table: {
      colorBgContainer: 'transparent',
      headerBg: 'transparent',
      headerColor: '#DBD4D3',
      rowHoverBg: 'rgba(114, 76, 249, 0.1)',
      borderColor: '#4a4554',
    },
    Modal: {
      contentBg: '#2c2638',
      headerBg: '#2c2638',
      titleColor: '#DBD4D3',
    },
  },
}))
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div
      class="w-[100dvw] h-[100dvh] bg-[#2c2638]"
      :class="themeStore.isDark ? 'dark' : 'light'"
    >
      <RouterView />
    </div>
  </a-config-provider>
</template>
