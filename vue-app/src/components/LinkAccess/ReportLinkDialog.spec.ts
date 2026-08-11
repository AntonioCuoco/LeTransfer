import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReportLinkDialog from './ReportLinkDialog.vue'

/**
 * Test della segnalazione (roadmap F1.5).
 *
 * La cosa da difendere qui non è il funzionamento — è il **tono**. Questa finestra non
 * deve promettere che il link verrà rimosso: il backend risponde in modo generico a
 * chiunque e la quarantena scatta a soglia. Prometterla la trasformerebbe in un modo
 * per far sparire il link di qualcun altro, ed è una promessa che non possiamo mantenere.
 */

const post = vi.fn()
vi.mock('axios', () => ({ default: { create: () => ({ post }) } }))

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: { status: 'received' } })
  document.body.innerHTML = ''
})

async function openDialog() {
  const wrapper = mount(ReportLinkDialog, {
    props: { publicToken: 'tok3n' },
    attachTo: document.body,
  })
  await wrapper.get('button').trigger('click')
  return wrapper
}

/**
 * Il dialogo vive in un `<Teleport to="body">`, quindi è fuori dall'albero del
 * componente: va cercato nel documento, non nel wrapper.
 */
function dialog(): HTMLElement {
  const element = document.querySelector('[role="dialog"]')
  if (!element) throw new Error('il dialogo non è aperto')
  return element as HTMLElement
}

async function clickDialogButton(label: string) {
  const button = Array.from(dialog().querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`bottone "${label}" non trovato nel dialogo`)
  button.click()
  await flushPromises()
}

describe('ReportLinkDialog', () => {
  it('sta in disparte finché non lo si apre', () => {
    const wrapper = mount(ReportLinkDialog, { props: { publicToken: 'tok3n' }, attachTo: document.body })

    expect(wrapper.text()).toContain('Segnala questo file')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('spiega perché la segnalazione conta proprio qui', async () => {
    await openDialog()

    // Il ragionamento del prodotto in una riga: noi non possiamo guardare, chi riceve sì.
    expect(dialog().textContent).toContain('noi non possiamo aprirlo')
    expect(dialog().textContent).toContain('Chi lo riceve sì')
  })

  it('invia il motivo scelto e conferma senza promettere la rimozione', async () => {
    await openDialog()

    const phishing = dialog().querySelectorAll('input[type="radio"]')[1] as HTMLInputElement
    phishing.click()
    await flushPromises()

    await clickDialogButton('Segnala')

    expect(post).toHaveBeenCalledWith('/guest/report/tok3n', { reason: 'phishing' })
    expect(dialog().textContent).toContain('Segnalazione ricevuta')
    expect(dialog().textContent).toContain('quarantena')
    // Nessuna forma di "rimosso" / "eliminato": non è quello che succede.
    expect(dialog().textContent).not.toMatch(/rimoss|eliminat/i)
  })

  it('dichiara che non stiamo ricevendo il file', async () => {
    await openDialog()
    expect(dialog().textContent).toContain('Non ci mandi il file')
  })

  it('conferma anche se la richiesta fallisce, invece di invitare a insistere', async () => {
    post.mockRejectedValue(new Error('rete'))
    await openDialog()

    await clickDialogButton('Segnala')

    // L'endpoint sta già facendo rate limiting: un "non è riuscito" spingerebbe a
    // ripremere, e la seconda richiesta verrebbe respinta comunque.
    expect(dialog().textContent).toContain('Segnalazione ricevuta')
  })
})
