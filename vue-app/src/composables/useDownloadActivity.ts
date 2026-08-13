import { ref, computed } from 'vue'

/**
 * "Qualcuno ha scaricato" — la parte che può funzionare oggi (roadmap E3/F3).
 *
 * **Cosa manca davvero.** La notifica *push/email* al download è lavoro backend
 * (BACKEND_HANDOFF voce 12): oggi nessun server manda niente a nessuno. Ma il dato per
 * accorgersene c'è già ed è onesto: `downloadCount` per link, che il backend restituisce
 * insieme ai link. Confrontarlo con quanto avevi visto l'ultima volta dice **quanti
 * download sono arrivati da allora** — che è l'informazione che l'utente vuole.
 *
 * ⚠️ **Sul `localStorage`.** Qui ci finisce **un numero e una data**, niente altro: nessun
 * nome di file, nessun token, nessun identificativo di link. È il contenitore minimo che
 * serve a rispondere "cosa è successo da quando non guardo", e non è sincronizzabile
 * altrove senza inventare un endpoint. Se un giorno il backend terrà traccia del "visto",
 * questo file sparisce.
 */

const STORAGE_KEY = 'letransfer_downloads_seen'

interface SeenState {
  /** Totale download già visti dall'utente. */
  count: number
  /** ISO della lettura, per poter dire "da martedì". */
  at: string
}

function readSeen(): SeenState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SeenState>
    if (typeof parsed?.count !== 'number' || !Number.isFinite(parsed.count)) return null
    return { count: parsed.count, at: typeof parsed.at === 'string' ? parsed.at : new Date().toISOString() }
  } catch {
    return null
  }
}

const seen = ref<SeenState | null>(readSeen())

export function useDownloadActivity() {
  /**
   * Quanti download sono arrivati da quando l'utente ha guardato l'ultima volta.
   * Al primo accesso non c'è un "prima": si restituisce 0 invece di sparare l'intero
   * storico come se fosse appena successo.
   */
  function newSince(totalDownloads: number): number {
    if (!seen.value) return 0
    // Se il totale è sceso (link cancellati) il confronto non ha senso: si riparte.
    if (totalDownloads < seen.value.count) return 0
    return totalDownloads - seen.value.count
  }

  /** Segna il totale corrente come "visto". */
  function markSeen(totalDownloads: number) {
    const next: SeenState = { count: totalDownloads, at: new Date().toISOString() }
    seen.value = next
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage pieno o negato: si perde solo la memoria del "visto", non un dato utente.
    }
  }

  const lastSeenAt = computed(() => seen.value?.at ?? null)

  return { newSince, markSeen, lastSeenAt }
}
