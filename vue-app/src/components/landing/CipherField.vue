<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * Campo generativo di "ciphertext": flussi di particelle che disegnano il fondo.
 * È l'arte fatta dalla cifratura. Il genitore chiama surge()/settle()/calm() per
 * reagire al ciclo di vita della cifratura (accelera + vira al menta = "sigillato").
 */

type Particle = {
  x: number
  y: number
  prevX: number
  prevY: number
  speed: number
  isMint: boolean
}

const canvasEl = ref<HTMLCanvasElement | null>(null)

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

let context: CanvasRenderingContext2D | null = null
let animationFrame = 0
let width = 0
let height = 0
let time = 0
let intensity = 0
let particles: Particle[] = []

const pixelRatio = Math.min(
  typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  2,
)

function createParticle(): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    prevX: 0,
    prevY: 0,
    speed: 0.5 + Math.random() * 1.4,
    isMint: Math.random() < 0.22,
  }
}

function resizeCanvas() {
  const canvas = canvasEl.value
  if (!canvas || !context) return

  width = canvas.clientWidth || window.innerWidth
  height = canvas.clientHeight || window.innerHeight

  canvas.width = width * pixelRatio
  canvas.height = height * pixelRatio
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

  const count = Math.min(340, Math.round((width * height) / 7000))
  particles = Array.from({ length: count }, createParticle)

  context.fillStyle = '#1f0d49'
  context.fillRect(0, 0, width, height)
}

// Angolo del flusso: somma di funzioni trigonometriche a strati (≈ flow field),
// così i flussi sono organici senza dover importare una libreria di noise.
function flowAngle(x: number, y: number): number {
  const layerA = Math.sin(x * 0.0016 + time * 0.00022)
  const layerB = Math.cos(y * 0.0015 - time * 0.00017)
  const layerC = Math.sin((x + y) * 0.0011 + time * 0.0003)
  return (layerA + layerB + layerC) * 1.9
}

function renderFrame() {
  if (!context) return

  time += 16

  // Sfuma il frame precedente → scie setose (più dense mentre si "sigilla").
  context.fillStyle = `rgba(31, 13, 73, ${0.1 - intensity * 0.055})`
  context.fillRect(0, 0, width, height)

  const speedBoost = 1 + intensity * 2.1

  for (const particle of particles) {
    particle.prevX = particle.x
    particle.prevY = particle.y

    const angle = flowAngle(particle.x, particle.y)
    particle.x += Math.cos(angle) * particle.speed * speedBoost
    particle.y += Math.sin(angle) * particle.speed * speedBoost

    const outOfBounds =
      particle.x < 0 || particle.x > width || particle.y < 0 || particle.y > height

    if (outOfBounds) {
      particle.x = Math.random() * width
      particle.y = Math.random() * height
      continue
    }

    // Viola di base, che deriva verso il menta man mano che l'intensità sale.
    const mintAmount = particle.isMint ? 1 : intensity
    const red = Math.round(124 + (55 - 124) * mintAmount)
    const green = Math.round(77 + (231 - 77) * mintAmount)
    const blue = Math.round(255 + (196 - 255) * mintAmount)

    context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${0.16 + intensity * 0.4})`
    context.lineWidth = particle.isMint ? 1.4 : 1
    context.beginPath()
    context.moveTo(particle.prevX, particle.prevY)
    context.lineTo(particle.x, particle.y)
    context.stroke()
  }

  animationFrame = requestAnimationFrame(renderFrame)
}

// Fallback statico ma elegante quando l'utente preferisce meno movimento.
function drawStaticField() {
  if (!context) return

  for (const particle of particles) {
    const angle = flowAngle(particle.x, particle.y)
    context.strokeStyle = 'rgba(124, 77, 255, 0.22)'
    context.beginPath()
    context.moveTo(particle.x, particle.y)
    context.lineTo(particle.x + Math.cos(angle) * 22, particle.y + Math.sin(angle) * 22)
    context.stroke()
  }
}

function rampIntensity(target: number, durationMs: number) {
  if (prefersReducedMotion) {
    intensity = target
    return
  }

  const from = intensity
  const start = performance.now()

  const step = (now: number) => {
    const progress = Math.min((now - start) / durationMs, 1)
    intensity = from + (target - from) * progress
    if (progress < 1) requestAnimationFrame(step)
  }

  requestAnimationFrame(step)
}

// API pubblica: il genitore reagisce al ciclo di vita della cifratura.
function surge() {
  rampIntensity(1, 700)
}

function settle() {
  rampIntensity(0.18, 1400)
}

function calm() {
  rampIntensity(0, 900)
}

defineExpose({ surge, settle, calm })

onMounted(() => {
  const canvas = canvasEl.value
  context = canvas ? canvas.getContext('2d') : null
  if (!context) return

  resizeCanvas()

  if (prefersReducedMotion) {
    drawStaticField()
  } else {
    animationFrame = requestAnimationFrame(renderFrame)
  }

  window.addEventListener('resize', resizeCanvas)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<template>
  <canvas ref="canvasEl" class="absolute inset-0 h-full w-full opacity-90" aria-hidden="true" />
</template>
