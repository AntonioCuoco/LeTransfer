import { onBeforeUnmount, onMounted, ref, type App, type ObjectDirective, type Ref } from 'vue'
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'

/**
 * Primitivi di movimento (roadmap F0.2).
 *
 * Tre gesti, tre soli: **entrata di pagina orchestrata**, **reveal allo scroll**,
 * **micro-interazione hover/press**. Sono pochi di proposito — un design system
 * con dodici animazioni diverse non è un linguaggio, è rumore.
 *
 * Regola non negoziabile: `prefers-reduced-motion: reduce` **spegne tutto**, e lo
 * spegne mostrando lo stato finale, mai nascondendo contenuto. Ogni primitivo qui
 * dentro parte dal caso ridotto e solo dopo decide se animare — per questo nessuno
 * di essi scrive `opacity: 0` prima di aver verificato la preferenza.
 *
 * Perché GSAP e non CSS: le transizioni CSS coprono già gli hover semplici (vedi i
 * primitivi `.lt-*` in tokens.css). Qui serve ciò che il CSS non fa bene —
 * sequenze con stagger, interruzione a metà senza scatti, press che si sovrappone
 * all'hover. Lo scroll usa `IntersectionObserver` e non ScrollTrigger: per un
 * "appari una volta" è la primitiva nativa giusta, e non paghiamo un plugin.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

gsap.registerPlugin(CustomEase)

/**
 * La gemella JS di `--ease-soft` (tokens.css): stessa cubica, stessa sensazione.
 * Senza CustomEase avremmo dovuto approssimare con `power3.out`, e movimento CSS e
 * movimento JS sulla stessa pagina si sarebbero sentiti "di due mani diverse".
 */
export const EASE_SOFT = CustomEase.create('lt-soft', 'M0,0 C0.2,0.7 0.2,1 1,1')

/** Lettura secca della preferenza di sistema (per direttive e codice non reattivo). */
export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  )
}

/**
 * Versione reattiva: la preferenza si può cambiare a sistema acceso, e chi la cambia
 * lo fa spesso *perché* qualcosa gli sta dando fastidio ora.
 */
export function useReducedMotion(): Ref<boolean> {
  const enabled = ref(reducedMotion())

  if (typeof window !== 'undefined' && window.matchMedia) {
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    const sync = (event: MediaQueryListEvent) => { enabled.value = event.matches }
    query.addEventListener('change', sync)
    onBeforeUnmount(() => query.removeEventListener('change', sync))
  }

  return enabled
}

// ── 1. Entrata di pagina orchestrata ────────────────────────────────────────────

export interface PageEnterOptions {
  /** Cosa animare dentro la radice. Default: gli elementi marcati `data-enter`. */
  selector?: string
  /** Spostamento verticale di partenza, in px. */
  y?: number
  /** Durata del singolo elemento, in secondi. */
  duration?: number
  /** Ritardo tra un elemento e il successivo. */
  stagger?: number
  /** Attesa prima del primo elemento. */
  delay?: number
}

/**
 * Entrata orchestrata: gli elementi marcati `data-enter` salgono e appaiono in
 * sequenza, nell'ordine del DOM. Uso:
 *
 * ```vue
 * const { root } = usePageEnter()
 * <div ref="root"> <p data-enter/> <h1 data-enter/> </div>
 * ```
 *
 * Usa `gsap.from`, non `gsap.to`: lo stato finale è quello che sta nel markup, quindi
 * se questo codice non gira mai (JS a terra, reduced-motion, errore) la pagina resta
 * quella giusta. Il contrario — nascondere in CSS e mostrare via JS — mette il
 * contenuto in ostaggio dell'animazione.
 */
export function usePageEnter(options: PageEnterOptions = {}) {
  const {
    selector = '[data-enter]',
    y = 20,
    duration = 0.62,
    stagger = 0.085,
    delay = 0.05,
  } = options

  const root = ref<HTMLElement | null>(null)
  let timeline: gsap.core.Timeline | null = null

  function play() {
    timeline?.kill()
    timeline = null

    const host = root.value
    if (!host || reducedMotion()) return

    const targets = Array.from(host.querySelectorAll<HTMLElement>(selector))
    if (targets.length === 0) return

    timeline = gsap.timeline({ defaults: { ease: EASE_SOFT, duration } })
    timeline.from(targets, {
      opacity: 0,
      y,
      stagger,
      delay,
      // A fine corsa togliamo gli stili inline: l'elemento torna a essere
      // esattamente ciò che dice il CSS, senza transform residue che
      // creerebbero un contesto di impilamento a sorpresa.
      clearProps: 'opacity,transform',
    })
  }

  onMounted(play)
  onBeforeUnmount(() => {
    timeline?.kill()
    timeline = null
  })

  return { root, play }
}

// ── 2. Reveal allo scroll (direttiva `v-reveal`) ────────────────────────────────

export interface RevealOptions {
  /** Spostamento verticale di partenza, in px. */
  y?: number
  duration?: number
  delay?: number
  /**
   * Se valorizzato, ad apparire sono i **figli diretti** dell'elemento, uno dopo
   * l'altro (griglie di schede); l'elemento stesso non viene toccato.
   */
  stagger?: number
  /** Frazione visibile che fa scattare il reveal. */
  threshold?: number
}

interface RevealState {
  observer: IntersectionObserver
  tween?: gsap.core.Tween
}

const revealStates = new WeakMap<HTMLElement, RevealState>()

/**
 * `v-reveal` — l'elemento (o i suoi figli diretti, con `stagger`) appare quando
 * entra nel viewport, una volta sola: un reveal che si ripete a ogni passaggio
 * trasforma lo scroll in un lavoro.
 *
 * ```vue
 * <section v-reveal>…</section>
 * <div v-reveal="{ stagger: 0.07 }"><article/><article/></div>
 * ```
 */
export const vReveal: ObjectDirective<HTMLElement, RevealOptions | undefined> = {
  mounted(el, binding) {
    if (reducedMotion() || typeof IntersectionObserver === 'undefined') return

    const { y = 26, duration = 0.7, delay = 0, stagger, threshold = 0.12 } = binding.value ?? {}
    const targets = stagger === undefined ? [el] : Array.from(el.children) as HTMLElement[]
    if (targets.length === 0) return

    gsap.set(targets, { opacity: 0, y })

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry?.isIntersecting) return
      observer.disconnect()

      const state = revealStates.get(el)
      if (state) {
        state.tween = gsap.to(targets, {
          opacity: 1,
          y: 0,
          duration,
          delay,
          stagger,
          ease: EASE_SOFT,
          clearProps: 'opacity,transform',
        })
      }
    // `-8%` in basso: il reveal parte quando l'elemento è entrato davvero, non
    // quando ne spunta il primo pixel sotto il bordo dello schermo.
    }, { threshold, rootMargin: '0px 0px -8% 0px' })

    revealStates.set(el, { observer })
    observer.observe(el)
  },

  unmounted(el) {
    const state = revealStates.get(el)
    if (!state) return
    state.observer.disconnect()
    state.tween?.kill()
    revealStates.delete(el)
  },
}

// ── 3. Micro-interazione hover/press (direttiva `v-lift`) ───────────────────────

export interface LiftOptions {
  /** Sollevamento in hover, in px (negativo = verso l'alto). */
  y?: number
  /** Ingrandimento in hover. */
  scale?: number
  /** Scala alla pressione: il "cede sotto il dito". */
  press?: number
}

interface LiftState {
  teardown: () => void
}

const liftStates = new WeakMap<HTMLElement, LiftState>()

function isInert(el: HTMLElement): boolean {
  return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
}

/**
 * `v-lift` — l'elemento si solleva al passaggio e **cede alla pressione**.
 *
 * Il press è il motivo per cui esiste: il sollevamento in hover lo fanno già i
 * primitivi `.lt-*` in CSS, ma il feedback tattile al click no, e su un bottone che
 * avvia una cifratura di minuti "ho premuto davvero?" è una domanda vera.
 *
 * `quickTo` invece di `gsap.to`: riusa lo stesso tween a ogni evento, così entrare
 * e uscire di fretta non accumula animazioni in coda.
 */
export const vLift: ObjectDirective<HTMLElement, LiftOptions | undefined> = {
  mounted(el, binding) {
    if (reducedMotion()) return

    const { y = -2, scale = 1.015, press = 0.985 } = binding.value ?? {}
    const moveY = gsap.quickTo(el, 'y', { duration: 0.24, ease: EASE_SOFT })
    const zoom = gsap.quickTo(el, 'scale', { duration: 0.24, ease: EASE_SOFT })

    let hovering = false

    const rest = () => { moveY(0); zoom(1) }
    const enter = () => {
      if (isInert(el)) return
      hovering = true
      moveY(y)
      zoom(scale)
    }
    const leave = () => {
      hovering = false
      rest()
    }
    const down = () => {
      if (isInert(el)) return
      zoom(press)
    }
    // Dopo il rilascio si torna in hover se il puntatore è ancora sopra (mouse),
    // a riposo altrimenti (tocco: non esiste un "sopra" dopo il dito).
    const up = () => {
      if (isInert(el)) return
      zoom(hovering ? scale : 1)
    }

    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', leave)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', leave)
    // Parità da tastiera: chi naviga in Tab riceve lo stesso segnale di chi passa il mouse.
    el.addEventListener('focus', enter)
    el.addEventListener('blur', leave)

    liftStates.set(el, {
      teardown: () => {
        el.removeEventListener('pointerenter', enter)
        el.removeEventListener('pointerleave', leave)
        el.removeEventListener('pointerdown', down)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', leave)
        el.removeEventListener('focus', enter)
        el.removeEventListener('blur', leave)
        gsap.killTweensOf(el)
      },
    })
  },

  unmounted(el) {
    liftStates.get(el)?.teardown()
    liftStates.delete(el)
  },
}

// ── Registrazione globale ───────────────────────────────────────────────────────

/** Rende `v-reveal` e `v-lift` disponibili in ogni template (vedi main.ts). */
export const MotionDirectives = {
  install(app: App) {
    app.directive('reveal', vReveal)
    app.directive('lift', vLift)
  },
}

declare module 'vue' {
  interface GlobalDirectives {
    vReveal: typeof vReveal
    vLift: typeof vLift
  }
}
