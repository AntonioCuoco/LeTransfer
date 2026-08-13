import { createRouter, createWebHistory } from 'vue-router'
import Cookies from 'js-cookie'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Public routes
    // La facciata pubblica ("invio senza account") è ora la root.
    { path: '/', component: () => import('@/src/pages/LandingPage.vue') },
    { path: '/landing', redirect: '/' }, // retrocompatibilità con eventuali vecchi link
    { path: '/come-funziona', component: () => import('@/src/pages/HowItWorksPage.vue') },
    { path: '/prezzi', component: () => import('@/src/pages/PricingPage.vue') },
    { path: '/sicurezza', component: () => import('@/src/pages/SecurityPage.vue') },
    { path: '/login', component: () => import('@/src/pages/LoginPage.vue') },
    { path: '/register', component: () => import('@/src/pages/RegisterPage.vue') },
    { path: '/oauth2/callback', component: () => import('@/src/pages/OAuthCallback.vue') },
    { path: '/share/:publicToken', component: () => import('@/src/pages/ShareAccessPage.vue') },

    // Protected routes (dashboard) — spostate sotto /app
    {
      path: '/app',
      component: () => import('@/src/components/layout/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', component: () => import('@/src/pages/Homepage.vue') },
        { path: 'profile', component: () => import('@/src/pages/Profile.vue') },
        { path: 'settings', component: () => import('@/src/pages/SettingsPage.vue') },
        // Ritorno da Stripe. Il path è cablato anche in useBilling.BILLING_RETURN_PATH,
        // che è ciò che il backend deve usare per `success_url`/`cancel_url`.
        { path: 'abbonamento/esito', component: () => import('@/src/pages/BillingReturnPage.vue') },
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
