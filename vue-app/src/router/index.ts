import { createRouter, createWebHistory } from 'vue-router'
import Cookies from 'js-cookie'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Public routes
    { path: '/landing', component: () => import('@/src/pages/LandingPage.vue') },
    { path: '/login', component: () => import('@/src/pages/LoginPage.vue') },
    { path: '/register', component: () => import('@/src/pages/RegisterPage.vue') },
    { path: '/oauth2/callback', component: () => import('@/src/pages/OAuthCallback.vue') },
    { path: '/share/:publicToken', component: () => import('@/src/pages/ShareAccessPage.vue') },

    // Protected routes
    {
      path: '/',
      component: () => import('@/src/components/layout/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', component: () => import('@/src/pages/Homepage.vue') },
        { path: 'profile', component: () => import('@/src/pages/Profile.vue') },
        { path: 'settings', component: () => import('@/src/pages/SettingsPage.vue') },
      ],
    },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth) {
    const accessToken = Cookies.get('accessToken')
    const refreshToken = Cookies.get('refreshToken')
    if (!accessToken && !refreshToken) {
      return { path: '/login' }
    }
  }
})

export default router
