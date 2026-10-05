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
    // Autorizzare la CLI (`novren login`): pubbliche, perché chi arriva può non avere ancora
    // una sessione. Senza l'interruttore del backend dicono «non ancora disponibile».
    { path: '/cli/authorize', component: () => import('@/src/pages/CliAuthorizePage.vue') },
    { path: '/cli/device', component: () => import('@/src/pages/CliDevicePage.vue') },
    // Pagina pubblica: chi carica non ha un account e spesso non sa cos'è Novren.
    { path: '/richiesta/:publicToken', component: () => import('@/src/pages/RequestUploadPage.vue') },

    // Protected routes (dashboard) — spostate sotto /app
    {
      path: '/app',
      component: () => import('@/src/components/layout/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', component: () => import('@/src/pages/Homepage.vue') },
        { path: 'profile', component: () => import('@/src/pages/Profile.vue') },
        { path: 'richieste', component: () => import('@/src/pages/RequestsPage.vue') },
        { path: 'settings', component: () => import('@/src/pages/SettingsPage.vue') },
        // Ritorno da Stripe. Il path è cablato anche in useBilling.BILLING_RETURN_PATH,
        // che è ciò che il backend deve usare per `success_url`/`cancel_url`.
        { path: 'abbonamento/esito', component: () => import('@/src/pages/BillingReturnPage.vue') },
      ],
    },
    // Pannello di amministrazione — richiede sessione (guardia server-side su AdminLayout).
    {
      path: '/admin',
      component: () => import('@/src/components/layout/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/admin/moderazione' },
        { path: 'moderazione', component: () => import('@/src/pages/admin/AdminModerationPage.vue') },
        { path: 'utenti', component: () => import('@/src/pages/admin/AdminUsersPage.vue') },
        { path: 'utenti/:userId', component: () => import('@/src/pages/admin/AdminUserDetailPage.vue') },
        { path: 'metriche', component: () => import('@/src/pages/admin/AdminMetricsPage.vue') },
        { path: 'costi', component: () => import('@/src/pages/admin/AdminCostsPage.vue') },
        { path: 'registro', component: () => import('@/src/pages/admin/AdminAuditPage.vue') },
      ],
    },

    // Catch-all: qualsiasi path non riconosciuto mostra la 404, non una schermata vuota.
    { path: '/:pathMatch(.*)*', component: () => import('@/src/pages/NotFoundPage.vue') },
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
