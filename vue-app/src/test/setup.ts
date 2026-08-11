import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach } from 'vitest'

/**
 * Impalcatura comune ai test di componente.
 *
 * Le direttive di movimento sono **sostituite con dei segnaposto** invece di essere
 * registrate davvero: `v-lift` e `v-reveal` tirerebbero dentro GSAP a ogni mount, per
 * verificare cose che questi test non guardano (il movimento si giudica a occhio, non
 * con un'asserzione). Senza i segnaposto Vue riempirebbe l'output di avvisi
 * "failed to resolve directive", che è il modo migliore per smettere di leggere l'output.
 */
config.global.directives = {
  lift: {},
  reveal: {},
}

// Ogni test parte da uno store pulito: le storie di un test non devono arrivare al successivo.
beforeEach(() => {
  setActivePinia(createPinia())
})
