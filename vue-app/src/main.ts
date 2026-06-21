import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import './index.css'
import App from './App.vue'
import router from './router'
import { initializeAxiosInterceptors } from './utils/axiosInterceptor'

initializeAxiosInterceptors()

const queryClient = new QueryClient({})

createApp(App)
  .use(createPinia())
  .use(router)
  .use(VueQueryPlugin, { queryClient })
  .use(Antd)
  .mount('#root')
