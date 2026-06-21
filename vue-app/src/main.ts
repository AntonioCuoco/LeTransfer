import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import 'primeicons/primeicons.css'
import './index.css'
import App from './App.vue'
import router from './router'
import { initializeAxiosInterceptors } from './utils/axiosInterceptor'
import { LeTransferPreset } from './theme/preset'
import { globalPt } from './theme/pt'

initializeAxiosInterceptors()

const queryClient = new QueryClient({})

createApp(App)
  .use(createPinia())
  .use(router)
  .use(VueQueryPlugin, { queryClient })
  .use(PrimeVue, {
    theme: {
      preset: LeTransferPreset,
      options: {
        // Dark mode is driven by the `dark` class on <html> (see stores/theme.ts)
        darkModeSelector: '.dark',
        // Put PrimeVue styles in a CSS layer so Tailwind utilities win on conflict.
        // Tailwind v4 layer order: theme, base, then primevue.
        cssLayer: {
          name: 'primevue',
          order: 'theme, base, primevue',
        },
      },
    },
    // Global PassThrough preset — like Nuxt UI's app.config.ts
    pt: globalPt,
  })
  .use(ToastService)
  .use(ConfirmationService)
  .mount('#root')
