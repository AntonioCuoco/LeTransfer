import { ref } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import { AUTH_COOKIES } from '@/src/utils/cookieStore'
import { apiErrorMessage, describeApiError } from '@/src/utils/apiError'

/**
 * Cancellazione dell'account (GDPR art. 17).
 *
 * **Non è una funzionalità, è un obbligo.** Finché l'unico modo per andarsene è scrivere
 * un'email, non si può aprire al pubblico né pubblicare una privacy policy onesta.
 *
 * ── Le due decisioni prese, e cosa comportano ───────────────────────────────────
 * 1. **Si cancella anche ciò che hai già condiviso.** I file che altri utenti hanno
 *    ricevuto da te smettono di essere raggiungibili. L'alternativa — tenerli — vorrebbe
 *    dire non aver cancellato davvero, e produce una frase impossibile da spiegare:
 *    «abbiamo cancellato il tuo account ma tenuto alcuni tuoi file».
 * 2. **Nessun periodo di grazia: la cancellazione è crittografica e immediata.** Il
 *    server distrugge per primo il materiale delle chiavi (`UserFileKeys`,
 *    `UserPublicKeys`, `UserSecurity`): da quell'istante i file sono illeggibili **per
 *    chiunque, incluso l'utente**, e i byte residui su R2 sono spazzatura indecifrabile
 *    che si ripulisce con calma. È il motivo per cui la garanzia non dipende da un job
 *    schedulato che deve girare dopo: vale subito.
 *
 * Conseguenza diretta: **non si torna indietro**. Per questo il dialogo che chiama questo
 * composable spiega prima, per esteso e con i numeri, cosa sta per succedere.
 *
 * ── Perché password + frase, e non (ancora) l'email ─────────────────────────────
 * Sono tre difese contro tre cose diverse:
 *   frase da digitare → l'incidente (non è sicurezza: è intenzionalità)
 *   password         → chi ha rubato la sessione, non la password
 *   conferma email   → chi ha rubato la password ma non la casella  ← non ancora
 * L'email arriva quando l'invio sarà agganciato (O1.2). Mettere un diritto di legge
 * dietro un canale che ancora non funziona sarebbe sbagliato: se finisce in spam,
 * l'utente non può cancellarsi. Il client gestisce **già** la risposta
 * `confirmation_sent`, così quel passaggio si innesta senza riscrivere niente.
 *
 * ── Contratto atteso dal backend ────────────────────────────────────────────────
 *   GET  /api/user/deletion/preview        (autenticata)
 *     200 → { success: true, data: { files, activeLinks, sharesToOthers } }
 *
 *   POST /api/user/deletion                (autenticata)
 *     body: { password }
 *     200 → { success: true, data: { status: 'deleted' } }
 *         | { success: true, data: { status: 'confirmation_sent', email } }   ← futuro
 *     401 → password errata
 * Ordine di esecuzione lato server (conta): materiale crittografico → revoca link →
 * record → oggetti su R2 → Cognito **per ultimo**. Le chiavi per prime perché è lì che la
 * garanzia diventa vera: se il job muore a metà, i dati sono già irrecuperabili.
 * ────────────────────────────────────────────────────────────────────────────────
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

/** Il database IndexedDB che contiene la chiave privata RSA (non esportabile). */
const KEY_DB_NAME = 'letransfer-keys'

/**
 * Tutto ciò che l'app lascia nel browser. Elencato per esteso e non dedotto con un
 * prefisso: `localStorage.clear()` cancellerebbe anche roba di altri, e un `for` sulle
 * chiavi che iniziano per `letransfer` dimenticherebbe `pkce_verifier` e `theme`.
 */
const LOCAL_KEYS = [
  'letransfer_user_settings',
  'letransfer_verified_keys',
  'letransfer_downloads_seen',
  'letransfer_keypair_initialized',
  'letransfer_private_key', // residuo di migrazioni vecchie, se presente
  'letransfer_public_key',
  'theme',
] as const

const SESSION_KEYS = ['letransfer_pending_claim', 'pkce_verifier'] as const

export interface DeletionPreview {
  /** File posseduti dall'utente. */
  files: number
  /** Link pubblici ancora validi: smetteranno di funzionare per chi li ha. */
  activeLinks: number
  /** File condivisi verso altri utenti: perderanno l'accesso. */
  sharesToOthers: number
  /** `false` quando i numeri sono stimati dal client perché l'endpoint non c'è. */
  isAuthoritative: boolean
}

export type DeletionOutcome =
  | { status: 'deleted' }
  | { status: 'confirmation_sent'; email?: string }
  | { status: 'wrong_password'; message?: string }
  | { status: 'unavailable'; message?: string }
  | { status: 'error'; message?: string }

/**
 * Cancella ogni traccia locale. Va chiamata **dopo** la conferma del server: è
 * irreversibile lato client tanto quanto lato server — qui dentro c'è la chiave privata
 * RSA, che non esiste in nessun altro posto in forma utilizzabile.
 *
 * Ogni passo è isolato: se IndexedDB è bloccato da un'altra scheda non deve impedire la
 * cancellazione dei cookie. Meglio una pulizia parziale che nessuna pulizia.
 */
export async function wipeLocalData(): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(KEY_DB_NAME)
      // `blocked` scatta se un'altra scheda tiene il DB aperto: non aspettiamo all'infinito,
      // il resto della pulizia vale comunque e il server ha già distrutto le chiavi.
      req.onsuccess = req.onerror = req.onblocked = () => resolve()
    })
  } catch { /* IndexedDB non disponibile: niente da cancellare */ }

  for (const key of LOCAL_KEYS) {
    try { localStorage.removeItem(key) } catch { /* storage negato */ }
  }
  for (const key of SESSION_KEYS) {
    try { sessionStorage.removeItem(key) } catch { /* storage negato */ }
  }
  for (const name of AUTH_COOKIES) {
    try { Cookies.remove(name) } catch { /* niente da rimuovere */ }
  }
}

export function useAccountDeletion() {
  const isLoadingPreview = ref(false)
  const isDeleting = ref(false)
  const preview = ref<DeletionPreview | null>(null)

  /**
   * L'inventario di ciò che sparirà. Se l'endpoint dedicato non esiste ancora, lo si
   * ricostruisce da quelli che ci sono — dichiarandolo, perché un numero dedotto non ha
   * lo stesso peso di un numero certo quando serve a decidere qualcosa di irreversibile.
   */
  async function loadPreview(): Promise<void> {
    isLoadingPreview.value = true
    try {
      try {
        const { data } = await axios.get<{ data?: Partial<DeletionPreview> }>(
          `${API_BASE_URL}/user/deletion/preview`,
        )
        if (data?.data) {
          preview.value = {
            files: data.data.files ?? 0,
            activeLinks: data.data.activeLinks ?? 0,
            sharesToOthers: data.data.sharesToOthers ?? 0,
            isAuthoritative: true,
          }
          return
        }
      } catch { /* l'endpoint non c'è: si ripiega sotto */ }

      preview.value = await estimatePreview()
    } finally {
      isLoadingPreview.value = false
    }
  }

  /**
   * Ripiego con gli endpoint esistenti. `sharesToOthers` resta `-1`: **non esiste** un
   * modo di saperlo lato client (`GET /api/shared-files` elenca ciò che ho *ricevuto*,
   * non ciò che ho *mandato*). Il dialogo mostra "alcuni" invece di inventare uno zero,
   * che sarebbe la bugia peggiore proprio qui.
   */
  async function estimatePreview(): Promise<DeletionPreview> {
    let files = 0
    let activeLinks = 0

    try {
      const { data } = await axios.get<{ files?: number }>(`${API_BASE_URL}/user/stats`)
      files = data?.files ?? 0
    } catch { /* lasciamo 0 */ }

    try {
      const { data } = await axios.get<{ data?: Array<{ revokedAt?: string | null; expiresAt?: string }> }>(
        `${API_BASE_URL}/shared-links`,
      )
      const now = Date.now()
      activeLinks = (data?.data ?? []).filter(
        (l) => !l.revokedAt && (!l.expiresAt || new Date(l.expiresAt).getTime() > now),
      ).length
    } catch { /* lasciamo 0 */ }

    return { files, activeLinks, sharesToOthers: -1, isAuthoritative: false }
  }

  /**
   * Avvia la cancellazione. Non fa la pulizia locale da sé: la decide il chiamante, che
   * sa se mostrare prima una schermata di commiato o navigare via.
   */
  async function requestDeletion(password: string): Promise<DeletionOutcome> {
    isDeleting.value = true
    try {
      const { data } = await axios.post<{ data?: { status?: string; email?: string } }>(
        `${API_BASE_URL}/user/deletion`,
        { password },
      )
      if (data?.data?.status === 'confirmation_sent') {
        return { status: 'confirmation_sent', email: data.data.email }
      }
      return { status: 'deleted' }
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      // Il testo del server, se c'è, lo mostra il dialogo; altrimenti usa il suo.
      const message = apiErrorMessage(error) ?? undefined
      if (status === 401 || status === 403) return { status: 'wrong_password', message }
      // 404/501 = il backend non ha ancora l'endpoint. Non è un errore dell'utente e non
      // va mostrato come tale: è una capacità che manca, e va detta con quelle parole.
      if (status === 404 || status === 501) return { status: 'unavailable', message }
      return { status: 'error', message: describeApiError(error, 'Non siamo riusciti a completare la richiesta.') }
    } finally {
      isDeleting.value = false
    }
  }

  return { preview, isLoadingPreview, isDeleting, loadPreview, requestDeletion, wipeLocalData }
}
