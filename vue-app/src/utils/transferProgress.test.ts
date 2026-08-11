import { describe, it, expect } from 'vitest'
import {
  planFileSlots,
  initialFileProgress,
  applyTransferRatio,
  completeFileProgress,
  type TransferInput,
} from './transferProgress'

/**
 * Test del progresso per-file (roadmap F1.1).
 *
 * Perché merita test: è codice che **sbaglia in silenzio**. Una barra che si muove
 * sembra sempre giusta — se la mappa "byte caricati → quale file" è sfasata, l'utente
 * vede numeri plausibili e nessuno se ne accorge, finché non chiude la pagina
 * convinto che il file grande sia partito quando invece era ancora fermo.
 */

const files: TransferInput[] = [
  { name: 'uno.txt', type: 'text/plain', size: 100 },
  { name: 'due.jpg', type: 'image/jpeg', size: 300 },
  { name: 'tre.pdf', type: 'application/pdf', size: 100 },
]

describe('planFileSlots', () => {
  it('dispone i file in intervalli consecutivi, nell’ordine dato', () => {
    expect(planFileSlots(files)).toEqual([
      { name: 'uno.txt', type: 'text/plain', size: 100, start: 0, end: 100 },
      { name: 'due.jpg', type: 'image/jpeg', size: 300, start: 100, end: 400 },
      { name: 'tre.pdf', type: 'application/pdf', size: 100, start: 400, end: 500 },
    ])
  })

  it('usa il percorso relativo quando c’è: è il nome che finirà nello zip', () => {
    const slots = planFileSlots([
      { name: 'uno.txt', type: 'text/plain', size: 10, path: 'foto/mare/uno.txt' },
    ])
    expect(slots[0].name).toBe('foto/mare/uno.txt')
  })

  it('regge la lista vuota', () => {
    expect(planFileSlots([])).toEqual([])
  })
})

describe('applyTransferRatio', () => {
  function stateAt(ratio: number) {
    const slots = planFileSlots(files)
    const entries = initialFileProgress(slots)
    applyTransferRatio(slots, entries, ratio)
    return entries.map((entry) => `${entry.name} ${entry.status} ${entry.percent}%`)
  }

  it('a zero non è partito niente', () => {
    expect(initialFileProgress(planFileSlots(files)).every((e) => e.status === 'pending' && e.percent === 0)).toBe(true)
    expect(stateAt(0)).toEqual([
      'uno.txt pending 0%',
      'due.jpg pending 0%',
      'tre.pdf pending 0%',
    ])
  })

  it('a metà: il primo è chiuso, il secondo è a metà, il terzo non è partito', () => {
    // 250 byte su 500: coprono tutto `uno` (0–100) e metà di `due` (100–400).
    expect(stateAt(0.5)).toEqual([
      'uno.txt done 100%',
      'due.jpg active 50%',
      'tre.pdf pending 0%',
    ])
  })

  it('non mostra 100% prima che il file sia davvero chiuso', () => {
    // 499,5 byte su 500: l'ultimo file è al 99,5%. Arrotondando per eccesso direbbe
    // "100%" con il trasferimento ancora in volo — una promessa fatta troppo presto.
    const slots = planFileSlots(files)
    const entries = initialFileProgress(slots)
    applyTransferRatio(slots, entries, 0.999)

    expect(entries[2]).toMatchObject({ status: 'active', percent: 99 })
  })

  it('segna "in corso" un file appena partito, anche sotto l’1%', () => {
    const slots = planFileSlots(files)
    const entries = initialFileProgress(slots)
    applyTransferRatio(slots, entries, 0.2002) // 100,1 byte: `due` ha appena iniziato

    expect(entries[1]).toMatchObject({ status: 'active', percent: 0 })
  })

  it('non fa mai retrocedere un file già chiuso né sfondare il 100%', () => {
    expect(stateAt(1)).toEqual([
      'uno.txt done 100%',
      'due.jpg done 100%',
      'tre.pdf done 100%',
    ])
    // Il ratio non dovrebbe superare 1, ma se succede la UI non deve mostrare 130%.
    expect(stateAt(1.3)).toEqual([
      'uno.txt done 100%',
      'due.jpg done 100%',
      'tre.pdf done 100%',
    ])
  })

  it('un file vuoto è finito appena tocca il suo turno', () => {
    const withEmpty: TransferInput[] = [
      { name: 'vuoto.txt', type: 'text/plain', size: 0 },
      { name: 'pieno.bin', type: '', size: 100 },
    ]
    const slots = planFileSlots(withEmpty)
    const entries = initialFileProgress(slots)

    applyTransferRatio(slots, entries, 0)
    expect(entries[0]).toMatchObject({ status: 'done', percent: 100 })

    applyTransferRatio(slots, entries, 0.25)
    expect(entries[1]).toMatchObject({ status: 'active', percent: 25 })
  })

  it('muta le voci esistenti invece di ricrearle', () => {
    // Non è un dettaglio interno: questa funzione gira a ogni evento di progresso, e
    // sostituire l'array farebbe ridisegnare l'intera lista a ogni pacchetto.
    const slots = planFileSlots(files)
    const entries = initialFileProgress(slots)
    const first = entries[0]

    applyTransferRatio(slots, entries, 0.5)

    expect(entries[0]).toBe(first)
    expect(first.percent).toBe(100)
  })

  it('non esplode se non c’è nessun file', () => {
    expect(() => applyTransferRatio([], [], 0.5)).not.toThrow()
  })
})

describe('completeFileProgress', () => {
  it('chiude tutto al 100%, senza arrotondamenti residui', () => {
    const slots = planFileSlots(files)
    const entries = initialFileProgress(slots)
    // Lo zip reale è un po' più grande della somma dei file (intestazioni), quindi il
    // ratio può fermarsi appena sotto 1: a fine invio si dichiara chiuso e basta.
    applyTransferRatio(slots, entries, 0.999)
    expect(entries[2].status).toBe('active')

    completeFileProgress(entries)
    expect(entries.every((entry) => entry.percent === 100 && entry.status === 'done')).toBe(true)
  })
})
