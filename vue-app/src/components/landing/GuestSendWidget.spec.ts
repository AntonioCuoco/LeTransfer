import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { useGuestUploadStore } from '@/src/stores/guestUpload'
import GuestSendWidget from './GuestSendWidget.vue'

/**
 * Test della carta d'invio (roadmap F1.1, F1.3, F1.5).
 *
 * Qui si verifica **cosa vede e cosa può fare l'utente** in ciascuno stato, non come è
 * fatto dentro. In particolare il cancello del controllo pre-invio: la regola è
 * "avvisa, non bloccare — tranne davanti a un travestimento", ed è una regola di
 * prodotto che si romperebbe in silenzio (un `disabled` di troppo o di meno non fa
 * fallire nessun typecheck, ma o blocca invii legittimi o lascia passare l'inganno).
 */

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/src/utils/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))
vi.mock('@/src/composables/useTurnstile', () => ({
  useTurnstile: () => ({ enabled: false, mount: vi.fn(), getToken: vi.fn(), refresh: vi.fn() }),
}))

const PE_HEADER = new Uint8Array([0x4d, 0x5a, 0x90, 0x00])

function mountWidget() {
  return mount(GuestSendWidget, { attachTo: document.body })
}

/** Simula la scelta di file dal selettore, che è la via che non dipende dal drag&drop. */
async function chooseFiles(wrapper: VueWrapper, files: File[]) {
  const input = wrapper.find('input[type="file"]:not([webkitdirectory])').element as HTMLInputElement
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  await wrapper.find('input[type="file"]:not([webkitdirectory])').trigger('change')
  // Il controllo pre-invio è asincrono (import dinamico + letture a fette).
  await flushPromises()
  await flushPromises()
}

function sendButton(wrapper: VueWrapper) {
  return wrapper.findAll('button').find((button) => /Cifra e crea il link|Conferma per procedere/.test(button.text()))!
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('stato iniziale', () => {
  it('invita a scegliere o trascinare, e non lascia inviare il nulla', () => {
    const wrapper = mountWidget()

    expect(wrapper.text()).toContain('Nuovo trasferimento')
    expect(wrapper.text()).toContain('trascina qui file o cartelle')
    expect(sendButton(wrapper).attributes('disabled')).toBeDefined()
  })
})

describe('composizione della coda', () => {
  it('elenca i file scelti col peso totale', async () => {
    const wrapper = mountWidget()
    await chooseFiles(wrapper, [
      new File(['x'.repeat(1500)], 'relazione.pdf', { type: 'application/pdf' }),
      new File(['y'.repeat(500)], 'foto.png', { type: 'image/png' }),
    ])

    expect(wrapper.text()).toContain('relazione.pdf')
    expect(wrapper.text()).toContain('foto.png')
    expect(wrapper.text()).toContain('2 file')
    expect(sendButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('toglie un file dalla coda', async () => {
    const wrapper = mountWidget()
    await chooseFiles(wrapper, [new File(['a'], 'uno.txt'), new File(['b'], 'due.txt')])

    await wrapper.findAll('button[title="Rimuovi"]')[0].trigger('click')
    expect(wrapper.text()).not.toContain('uno.txt')
    expect(wrapper.text()).toContain('due.txt')
  })
})

/**
 * La scala ospite → Free → Pro (2026-10-05): senza account si manda al volo fino a 1 GB. Oltre,
 * il widget lo dice **prima** di cifrare e propone l'account gratuito. Sbagliare qui in un
 * senso fa cifrare per minuti un invio che il server rifiuterà; nell'altro blocca invii
 * che il server accetterebbe.
 */
describe('limite senza account', () => {
  /** Un file del peso dichiarato, senza allocarne davvero i byte. */
  function fileOf(bytes: number, name: string) {
    const file = new File(['contenuto'], name, { type: 'video/mp4' })
    Object.defineProperty(file, 'size', { value: bytes })
    return file
  }

  it('dice sempre fin dove si arriva senza account, e cosa dà un account gratuito', () => {
    expect(mountWidget().get('[data-testid="guest-limit-hint"]').text()).toBe('senza account fino a 1 GB per invio · gratis con un account fino a 5 GB')
  })

  it('oltre 1 GB blocca prima di cifrare e propone l’account gratuito', async () => {
    const wrapper = mountWidget()
    await chooseFiles(wrapper, [fileOf(700 * 1024 ** 2, 'parte1.mp4'), fileOf(500 * 1024 ** 2, 'parte2.mp4')])

    const nudge = wrapper.get('[data-testid="guest-over-limit"]').text()
    expect(nudge).toContain('Senza account si manda fino a 1 GB alla volta')
    expect(nudge).toContain('5 GB per file e 50 GB al mese')
    expect(sendButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('a 1 GB esatto si manda ancora: il controllo non è più severo del server', async () => {
    const wrapper = mountWidget()
    await chooseFiles(wrapper, [fileOf(1024 ** 3, 'video.mp4')])

    expect(wrapper.find('[data-testid="guest-over-limit"]').exists()).toBe(false)
    expect(sendButton(wrapper).attributes('disabled')).toBeUndefined()
  })
})

describe('controllo pre-invio', () => {
  it('blocca l’invio davanti a un travestimento, finché non lo confermi', async () => {
    const wrapper = mountWidget()
    // Un eseguibile che si spaccia per immagine: è l'unico caso in cui ci mettiamo di traverso.
    await chooseFiles(wrapper, [new File([PE_HEADER], 'vacanze.jpg', { type: 'image/jpeg' })])

    expect(wrapper.text()).toContain('Il contenuto non è quello che dice l’estensione')
    const button = sendButton(wrapper)
    expect(button.text()).toBe('Conferma per procedere')
    expect(button.attributes('disabled')).toBeDefined()

    await wrapper.find('input[type="checkbox"]').setValue(true)
    expect(sendButton(wrapper).text()).toBe('Cifra e crea il link')
    expect(sendButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('avvisa senza bloccare quando il rilievo non è un inganno', async () => {
    const wrapper = mountWidget()
    // Un PDF con contenuto attivo: vale la pena dirlo, non vale bloccare.
    await chooseFiles(wrapper, [new File(['%PDF-1.7\n/OpenAction /JavaScript'], 'modulo.pdf')])

    expect(wrapper.text()).toContain('Il PDF contiene contenuto attivo')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    expect(sendButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('tace su un eseguibile che si dichiara tale: mandare build è un uso normale', async () => {
    const wrapper = mountWidget()
    await chooseFiles(wrapper, [new File([PE_HEADER], 'LeTransfer-setup.exe')])

    expect(wrapper.text()).not.toContain('Il contenuto non è quello che dice l’estensione')
    expect(sendButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('la conferma decade se cambi la selezione', async () => {
    const wrapper = mountWidget()
    await chooseFiles(wrapper, [new File([PE_HEADER], 'vacanze.jpg')])
    await wrapper.find('input[type="checkbox"]').setValue(true)
    expect(sendButton(wrapper).attributes('disabled')).toBeUndefined()

    // Si aggiunge un altro file travestito: la conferma di prima riguardava altro.
    await chooseFiles(wrapper, [new File([PE_HEADER], 'documento.pdf')])
    expect(sendButton(wrapper).attributes('disabled')).toBeDefined()
  })
})

describe('durante la cifratura', () => {
  it('mostra il progresso per-file solo quando i file sono più di uno', async () => {
    const wrapper = mountWidget()
    const store = useGuestUploadStore()

    store.status = 'uploading'
    store.progress = 42
    store.fileProgress = [{ name: 'solo.txt', type: 'text/plain', size: 10, percent: 42, status: 'active' }]
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('42%')
    // Con un file solo la barra generale È già il suo progresso: ripeterlo è rumore.
    expect(wrapper.text()).not.toContain('in attesa')

    store.fileProgress = [
      { name: 'uno.txt', type: 'text/plain', size: 10, percent: 100, status: 'done' },
      { name: 'due.txt', type: 'text/plain', size: 10, percent: 0, status: 'pending' },
    ]
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('cifrato ✓')
    expect(wrapper.text()).toContain('in attesa')
  })
})

describe('a link pronto', () => {
  async function readyWidget() {
    const wrapper = mountWidget()
    const store = useGuestUploadStore()
    store.status = 'done'
    store.progress = 100
    store.summary = '1 file · cifrato · scade tra 7 giorni'
    store.result = {
      shareUrl: 'https://letransfer.app/share/tok3n#key=CHIAVE&iv=IV',
      publicToken: 'tok3n',
      manageToken: 'manage',
      expiresAt: null,
    }
    await wrapper.vm.$nextTick()
    return { wrapper, store }
  }

  it('mostra il link separando il frammento dal resto', async () => {
    const { wrapper } = await readyWidget()

    expect(wrapper.text()).toContain('Link pronto')
    expect(wrapper.text()).toContain('1 file · cifrato · scade tra 7 giorni')
    expect(wrapper.text()).toContain('letransfer.app/share/tok3n')
    // Il frammento è mostrato troncato ai primi 8 caratteri: serve a far *vedere* che
    // la chiave è lì, non a farla leggere. Di chiave vera se ne intravedono quattro.
    expect(wrapper.text()).toContain('#key=CHIA…')
    expect(wrapper.text()).not.toContain('CHIAVE')
  })

  it('apre il QR su richiesta, non di default', async () => {
    const { wrapper } = await readyWidget()
    expect(wrapper.find('svg[role="img"]').exists()).toBe(false)

    await wrapper.find('button[aria-label="Mostra il codice QR del link"]').trigger('click')
    expect(wrapper.find('svg[role="img"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('chi lo inquadra scarica il file')
  })

  it('avverte che la revoca vale finché la carta è aperta', async () => {
    const { wrapper } = await readyWidget()
    expect(wrapper.text()).toContain('Puoi ritirarlo finché non chiudi questa scheda')
    expect(wrapper.text()).toContain('Revoca invio')
  })
})
