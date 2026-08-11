import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { useGuestUploadStore } from '@/src/stores/guestUpload'
import GuestTransferPill from './GuestTransferPill.vue'

/**
 * Test della pillola che segue l'invio in background (roadmap F1.1).
 *
 * Tutta la sua ragione d'essere è **quando compare**: se comparisse anche sulla
 * facciata duplicherebbe la carta (due progressi contemporanei sono rumore, non
 * rassicurazione); se non comparisse altrove, "in background" vorrebbe dire soltanto
 * "invisibile" — e l'utente scoprirebbe di aver perso il link solo tornando indietro.
 */

const push = vi.fn()
let currentPath = '/come-funziona'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ get path() { return currentPath } }),
}))

function mountPill(path: string) {
  currentPath = path
  return mount(GuestTransferPill)
}

describe('quando compare', () => {
  it('resta invisibile a riposo', () => {
    expect(mountPill('/come-funziona').find('button').exists()).toBe(false)
  })

  it('non compare sulla facciata: lì la carta racconta già tutto', () => {
    const wrapper = mountPill('/')
    const store = useGuestUploadStore()
    store.status = 'uploading'
    store.progress = 40

    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('compare sulle altre pagine pubbliche mentre l’invio va avanti', async () => {
    const wrapper = mountPill('/sicurezza')
    const store = useGuestUploadStore()
    store.status = 'uploading'
    store.progress = 40
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Cifro e carico — 40%')
    expect(wrapper.text()).toContain('puoi continuare a navigare')
  })

  it('annuncia il link pronto: è il momento in cui prima si perdeva l’invio', async () => {
    const wrapper = mountPill('/prezzi')
    const store = useGuestUploadStore()
    store.status = 'done'
    store.progress = 100
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Link pronto')
    expect(wrapper.text()).toContain('torna all’invio per copiarlo')
  })

  it('riporta alla facciata al click', async () => {
    const wrapper = mountPill('/prezzi')
    const store = useGuestUploadStore()
    store.status = 'done'
    await wrapper.vm.$nextTick()

    await wrapper.get('button').trigger('click')
    expect(push).toHaveBeenCalledWith('/')
  })
})

describe('cosa dice', () => {
  it('nomina la fase invece di mostrare una percentuale che non c’è ancora', async () => {
    const wrapper = mountPill('/sicurezza')
    const store = useGuestUploadStore()

    store.status = 'preparing'
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Genero la chiave…')

    store.status = 'finalizing'
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Creo il link…')
  })
})
