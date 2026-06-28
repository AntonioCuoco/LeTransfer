# 🌐 Landing Page

## Overview

Pagina pubblica di presentazione dell'applicazione accessibile senza autenticazione. Design moderno con animazioni 3D e stile ispirato a WeTransfer.

---

## Architettura

```
┌─────────────────────────────────────────────────────────────┐
│                    LandingPage.vue                           │
│                  /landing route                              │
├─────────────────────────────────────────────────────────────┤
│  Hero Section   - Logo animato, headline, CTA, 3D background  │
│  Features       - Veloce, Sicuro, Condivisibile               │
│  Footer         - Link, copyright, brand "leTransfer"         │
└─────────────────────────────────────────────────────────────┘
```

---

## Componente: LandingPage.vue

File: `vue-app/src/pages/LandingPage.vue`.

### Caratteristiche
- **Animazioni GSAP** per transizioni fluide
- **Three.js** per elementi 3D
- **Responsive design** per mobile/desktop
- **Dark theme** coerente con l'app

### Struttura

`useRef` → template ref; `useEffect(..., [])` → `onMounted` con cleanup in `onUnmounted`:

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'

const container = ref<HTMLDivElement | null>(null)
let cleanupThree: (() => void) | undefined

onMounted(() => {
  gsap.from('.hero-title', { y: 100, opacity: 0, duration: 1, ease: 'power3.out' })
  cleanupThree = initThreeJS()
})

onUnmounted(() => {
  cleanupThree?.() // cancelAnimationFrame + dispose della scena Three.js
})
</script>

<template>
  <div ref="container" class="landing-page">
    <HeroSection />
    <FeaturesSection />
    <LandingFooter />
  </div>
</template>
```

---

## Sezioni

### Hero Section

`<Link to>` di react-router diventa `<RouterLink to>`:

```vue
<template>
  <section class="hero">
    <div class="hero-content">
      <h1 class="hero-title">
        Trasferisci file.<br />
        <span class="gradient">Semplicemente.</span>
      </h1>
      <p class="hero-subtitle">Condividi file in modo sicuro e veloce</p>
      <div class="hero-cta">
        <RouterLink to="/register" class="btn-primary">Inizia Gratis</RouterLink>
        <RouterLink to="/login" class="btn-secondary">Accedi</RouterLink>
      </div>
    </div>
    <ThreeJSCanvas />
  </section>
</template>
```

### Features Section

```ts
const features = [
  { icon: 'pi pi-bolt',   title: 'Veloce',        description: 'Upload multipart per file di qualsiasi dimensione' },
  { icon: 'pi pi-lock',   title: 'Sicuro',        description: 'Crittografia e link protetti da password' },
  { icon: 'pi pi-share-alt', title: 'Condivisibile', description: 'Invia a chiunque via email o link' },
]
```
```vue
<div class="features-grid">
  <FeatureCard v-for="f in features" :key="f.title" v-bind="f" />
</div>
```

### Footer

```vue
<template>
  <footer class="landing-footer">
    <div class="footer-links">
      <div class="footer-column">
        <h4>Prodotto</h4>
        <a href="#">Funzionalità</a>
        <a href="#">Prezzi</a>
      </div>
      <div class="footer-column">
        <h4>Azienda</h4>
        <a href="#">Chi siamo</a>
        <a href="#">Contatti</a>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2026 leTransfer. Tutti i diritti riservati.</p>
    </div>
    <h2 class="footer-brand">leTransfer</h2>
  </footer>
</template>
```

---

## Stile

### Palette Colori

```css
:root {
  --landing-bg: #2c2638;
  --landing-primary: #8b5cf6;
  --landing-secondary: #6366f1;
  --landing-text: #ffffff;
  --landing-text-muted: #a0a0a0;
  --gradient: linear-gradient(135deg, #8b5cf6, #6366f1);
}
```

### Animazioni

```css
.hero-title { animation: slideUp 1s ease-out; }

@keyframes slideUp {
  from { transform: translateY(50px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

.gradient {
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

---

## Three.js Integration

Codice identico (libreria framework-agnostica); aggiungere il **cleanup** per Vue `onUnmounted`:

```ts
import * as THREE from 'three'

const initThreeJS = (): (() => void) => {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
  const renderer = new THREE.WebGLRenderer({ alpha: true })

  const geometry = new THREE.TorusKnotGeometry(10, 3, 100, 16)
  const material = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.7, roughness: 0.2 })
  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  let rafId = 0
  const animate = () => {
    rafId = requestAnimationFrame(animate)
    mesh.rotation.x += 0.01
    mesh.rotation.y += 0.01
    renderer.render(scene, camera)
  }
  animate()

  // cleanup chiamato in onUnmounted
  return () => {
    cancelAnimationFrame(rafId)
    geometry.dispose()
    material.dispose()
    renderer.dispose()
  }
}
```

---

## Responsive

```css
@media (max-width: 768px) {
  .hero-title { font-size: 2.5rem; }
  .hero-cta { flex-direction: column; gap: 1rem; }
  .features-grid { grid-template-columns: 1fr; }
}
```

---

## Routing (`vue-app/src/router/index.ts`)

```ts
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/landing', component: () => import('@/src/pages/LandingPage.vue') },
    { path: '/login',   component: () => import('@/src/pages/LoginPage.vue') },
    // route protette con meta.requiresAuth → vedi docs/01-autenticazione.md
  ],
})
```

---

## Considerazioni

1. **Performance** — lazy load per Three.js e animazioni; cleanup risorse in `onUnmounted`.
2. **SEO** — meta tag appropriati per la landing.
3. **Accessibilità** — contrasto colori, alt text.
4. **Loading** — stato di caricamento per elementi 3D.
