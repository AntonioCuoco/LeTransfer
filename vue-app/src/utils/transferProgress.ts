/**
 * Dal progresso globale di un invio a quello **per-file** (roadmap F1.1).
 *
 * Il problema: più file diventano un unico zip in streaming, quindi lo storage
 * accetta byte dell'archivio, non "il file 3 su 7". Ma chi guarda vuole sapere a
 * che punto è *il suo* file, non a che punto è un archivio che non ha chiesto.
 *
 * La soluzione: client-zip scrive i file **nell'ordine in cui glieli diamo**, quindi
 * ciascuno occupa un intervallo noto `[start, end)` del flusso in chiaro. Sapendo
 * quanta parte del flusso è stata caricata, si sa esattamente dove si è arrivati
 * dentro ogni intervallo.
 *
 * Modulo puro di proposito: niente Vue, niente rete. È la parte che, se sbaglia,
 * sbaglia in silenzio mostrando numeri plausibili — quindi è la parte da testare.
 */

export type FileTransferStatus = 'pending' | 'active' | 'done'

/** Ciò che serve sapere di un file per collocarlo nel flusso (un `File` lo soddisfa). */
export interface TransferInput {
  name: string
  type: string
  size: number
  /** Percorso relativo, quando il file arriva da una cartella. */
  path?: string
}

/** Stato di UN file dentro l'invio, come lo legge la UI. */
export interface FileProgress {
  name: string
  /** MIME dichiarato dal browser: serve alla targhetta del tipo di file. */
  type: string
  size: number
  /** 0–100, dedotto dai byte di ciphertext davvero caricati. */
  percent: number
  status: FileTransferStatus
}

/** Dove vive un file dentro il flusso caricato, in byte. */
export interface FileSlot {
  name: string
  type: string
  size: number
  start: number
  end: number
}

/** Dispone i file uno dopo l'altro, nello stesso ordine in cui finiranno nell'archivio. */
export function planFileSlots(files: readonly TransferInput[]): FileSlot[] {
  let offset = 0
  return files.map((file) => {
    const slot: FileSlot = {
      name: file.path || file.name,
      type: file.type,
      size: file.size,
      start: offset,
      end: offset + file.size,
    }
    offset += file.size
    return slot
  })
}

export function initialFileProgress(slots: readonly FileSlot[]): FileProgress[] {
  return slots.map((slot) => ({
    name: slot.name,
    type: slot.type,
    size: slot.size,
    percent: 0,
    status: 'pending',
  }))
}

/**
 * Riporta la frazione di trasferimento completata (0–1) su ogni file, **mutando**
 * le voci esistenti invece di ricrearle: durante un upload questa funzione viene
 * chiamata a ogni evento di progresso, e sostituire l'array farebbe ridisegnare
 * tutta la lista a ogni pacchetto.
 *
 * `ratio` è misurato sui byte accettati dallo storage — è il progresso vero, non una
 * stima temporale.
 *
 * ⚠️ Approssimazione dichiarata: lo zip intercala ~30 byte di intestazione per file,
 * che qui non contiamo. Su file da megabyte lo scarto è invisibile, e l'ordine di
 * completamento resta comunque quello reale.
 */
export function applyTransferRatio(
  slots: readonly FileSlot[],
  entries: FileProgress[],
  ratio: number,
): void {
  if (slots.length === 0) return
  const plainTotal = slots[slots.length - 1].end
  const uploaded = ratio * plainTotal

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index]
    const entry = entries[index]
    if (!entry) continue

    // Un file vuoto non ha byte da attendere: è finito appena tocca il suo turno.
    const filled = slot.size === 0
      ? (uploaded >= slot.start ? 1 : 0)
      : Math.min(1, Math.max(0, (uploaded - slot.start) / slot.size))

    // `floor` e non `round`: arrotondando per eccesso un file al 99,5% mostrerebbe
    // "100%" mentre è ancora in volo. Su una barra di progresso il 100% è una
    // promessa, e non va fatta prima che sia vera.
    const percent = Math.floor(filled * 100)
    // Lo stato viene da `filled`, non dalla percentuale arrotondata: un file appena
    // partito è "in corso" anche quando l'arrotondamento lo mostra ancora a 0%.
    const status: FileTransferStatus = filled >= 1 ? 'done' : filled > 0 ? 'active' : 'pending'

    if (entry.percent !== percent) entry.percent = percent
    if (entry.status !== status) entry.status = status
  }
}

/** A fine invio non si arrotonda: è finito e basta. */
export function completeFileProgress(entries: FileProgress[]): void {
  for (const entry of entries) {
    entry.percent = 100
    entry.status = 'done'
  }
}
