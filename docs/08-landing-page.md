# 🌐 Landing Page

## Overview

Pagina pubblica di presentazione dell'applicazione accessibile senza autenticazione. Design moderno con animazioni 3D e stile ispirato a WeTransfer.

---

## Architettura

```
┌─────────────────────────────────────────────────────────────┐
│                    Landing Page                              │
│                  /landing route                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    Hero Section                         │ │
│  │  - Logo animato                                         │ │
│  │  - Headline principale                                  │ │
│  │  - CTA buttons (Login / Registrati)                    │ │
│  │  - Animazione 3D background                            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                  Features Section                       │ │
│  │  - Trasferimento veloce                                 │ │
│  │  - Sicurezza                                            │ │
│  │  - Condivisione facile                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    Footer                               │ │
│  │  - Link navigazione                                     │ │
│  │  - Copyright                                            │ │
│  │  - Brand "leTransfer"                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Componente: LandingPageRef

File: `src/components/LandingPageRef.tsx`

### Caratteristiche
- **Animazioni GSAP** per transizioni fluide
- **Three.js** per elementi 3D
- **Responsive design** per mobile/desktop
- **Dark theme** coerente con l'app

### Struttura

```tsx
const LandingPageRef = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        // Inizializza animazioni GSAP
        gsap.from('.hero-title', {
            y: 100,
            opacity: 0,
            duration: 1,
            ease: 'power3.out'
        });
        
        // Setup Three.js scene
        initThreeJS();
    }, []);
    
    return (
        <div ref={containerRef} className="landing-page">
            <HeroSection />
            <FeaturesSection />
            <Footer />
        </div>
    );
};
```

---

## Sezioni

### Hero Section

```tsx
const HeroSection = () => (
    <section className="hero">
        <div className="hero-content">
            <h1 className="hero-title">
                Trasferisci file.<br />
                <span className="gradient">Semplicemente.</span>
            </h1>
            <p className="hero-subtitle">
                Condividi file in modo sicuro e veloce
            </p>
            <div className="hero-cta">
                <Link to="/register" className="btn-primary">
                    Inizia Gratis
                </Link>
                <Link to="/login" className="btn-secondary">
                    Accedi
                </Link>
            </div>
        </div>
        <ThreeJSCanvas />
    </section>
);
```

### Features Section

```tsx
const features = [
    {
        icon: <RocketIcon />,
        title: 'Veloce',
        description: 'Upload multipart per file di qualsiasi dimensione'
    },
    {
        icon: <LockIcon />,
        title: 'Sicuro', 
        description: 'Crittografia e link protetti da password'
    },
    {
        icon: <ShareIcon />,
        title: 'Condivisibile',
        description: 'Invia a chiunque via email o link'
    }
];
```

### Footer

```tsx
const Footer = () => (
    <footer className="landing-footer">
        <div className="footer-links">
            <div className="footer-column">
                <h4>Prodotto</h4>
                <a href="#">Funzionalità</a>
                <a href="#">Prezzi</a>
            </div>
            <div className="footer-column">
                <h4>Azienda</h4>
                <a href="#">Chi siamo</a>
                <a href="#">Contatti</a>
            </div>
        </div>
        <div className="footer-bottom">
            <p>© 2026 leTransfer. Tutti i diritti riservati.</p>
        </div>
        <h2 className="footer-brand">leTransfer</h2>
    </footer>
);
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
.hero-title {
    animation: slideUp 1s ease-out;
}

@keyframes slideUp {
    from {
        transform: translateY(50px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.gradient {
    background: var(--gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}
```

---

## Three.js Integration

```typescript
const initThreeJS = () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true });
    
    // Geometria decorativa
    const geometry = new THREE.TorusKnotGeometry(10, 3, 100, 16);
    const material = new THREE.MeshStandardMaterial({
        color: 0x8b5cf6,
        metalness: 0.7,
        roughness: 0.2
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    
    // Animation loop
    const animate = () => {
        requestAnimationFrame(animate);
        mesh.rotation.x += 0.01;
        mesh.rotation.y += 0.01;
        renderer.render(scene, camera);
    };
    
    animate();
};
```

---

## Responsive

### Mobile

```css
@media (max-width: 768px) {
    .hero-title {
        font-size: 2.5rem;
    }
    
    .hero-cta {
        flex-direction: column;
        gap: 1rem;
    }
    
    .features-grid {
        grid-template-columns: 1fr;
    }
}
```

---

## Routing

```tsx
// App.tsx
<Routes>
    <Route path="/landing" element={<LandingPageRef />} />
    <Route path="/login" element={<LoginPage />} />
    {/* Route protette */}
</Routes>
```

---

## Considerazioni

1. **Performance** - Lazy load per Three.js e animazioni
2. **SEO** - Meta tags appropriati per la landing
3. **Accessibilità** - Contrasto colori, alt text
4. **Loading** - Stato di caricamento per elementi 3D
