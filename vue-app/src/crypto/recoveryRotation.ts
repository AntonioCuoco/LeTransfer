import {
  arrayBufferToBase64,
  generateSalt,
  rewrapPrivateKeyBackup,
  unwrapFileKey,
  wrapFileKey,
  type KeyPairBackup,
} from './crypto'
import { createVerificationHash, deriveMasterKeyFromMnemonic, verifyMasterKey } from './recovery-key'
import { unwrapXWingSeedWithMasterKey, wrapXWingSeedWithMasterKey, type XWingSeedBackup } from './hybrid'

/**
 * Cambio delle 24 parole, lato client (stesso flusso di `rotation.rs` nel client desktop).
 *
 * La master key cifra quattro cose: il blob di verifica, le chiavi dei file, il backup della
 * chiave privata RSA e quello del seme X-Wing. Qui si aprono con la master key attuale e si
 * richiudono con quella nuova, **su questo dispositivo**: il server riceve solo byte che non sa
 * aprire, e li attiva tutti insieme al commit (`services/keyRotation.js` nel backend).
 *
 * Se qualcosa va storto prima del commit, la rotazione si annulla e restano valide le parole di
 * sempre. Dopo il commit valgono solo le nuove: per questo l'interfaccia le fa confermare
 * **prima** di chiamare `rotateRecoveryKey`.
 *
 * ⚠️ Cambiare le parole non cambia le chiavi d'identità (RSA e X-Wing): chi avesse avuto sia le
 * parole vecchie sia l'accesso all'account potrebbe averne già copiato i backup.
 *
 * Rete iniettata (come in `xwingKeySync.ts`): la cartella crypto non fa chiamate, e il flusso si
 * verifica in `recoveryRotation.test.ts` contro un finto backend con la stessa semantica.
 */

/** Chiavi per lotto: il tetto del backend. */
export const ROTATION_BATCH = 100

export type RotationStage = 'preparing' | 'fileKeys' | 'backups' | 'activating'

/** A che punto è la rotazione, per la barra di avanzamento. */
export interface RotationProgress {
  stage: RotationStage
  done: number
  total: number
}

export interface RotationFileKey {
  s3Key: string
  wrappedKey: string
  wrapIV: string
}

export interface RotationBegin {
  password: string
  currentVerificationHash: string
  salt: string
  verificationHash: string
}

export interface RecoveryRotationDeps {
  /** Lo stato della chiave di recupero adesso (`GET /user/recovery-key/status`). */
  fetchStatus: () => Promise<{ hasRecoveryKey: boolean; verificationHash?: string }>
  /** Apre la rotazione e ne restituisce l'id. Qui il server controlla la password. */
  begin: (request: RotationBegin) => Promise<string>
  listFileKeys: () => Promise<RotationFileKey[]>
  stageFileKeys: (rotationId: string, items: RotationFileKey[]) => Promise<void>
  /** `null` = l'account non ha questo backup. Qualunque altro problema: eccezione. */
  fetchKeyPairBackup: () => Promise<KeyPairBackup | null>
  fetchXWingBackup: () => Promise<XWingSeedBackup | null>
  stageBackups: (rotationId: string, backups: { keypair: KeyPairBackup | null; xwing: XWingSeedBackup | null }) => Promise<void>
  /** `'incomplete'` = è arrivata una chiave fra l'elenco e il commit (409 `ROTATION_INCOMPLETE`). */
  commit: (rotationId: string) => Promise<'committed' | 'incomplete'>
  /** Chiude la rotazione aperta: restano valide le parole di sempre. */
  cancel: () => Promise<void>
}

/** Un errore da mostrare all'utente così com'è. */
export class RotationError extends Error {}

/** Chiavi che la master key attuale non apre: ricifrarle è impossibile, quindi ci si ferma. */
export class RotationBlockedError extends RotationError {
  constructor(readonly unreadable: number) {
    super(
      unreadable === 1
        ? 'Una chiave di un tuo file non si apre con le 24 parole attuali: cambiarle la renderebbe irrecuperabile. Scrivici prima di procedere.'
        : `${unreadable} chiavi dei tuoi file non si aprono con le 24 parole attuali: cambiarle le renderebbe irrecuperabili. Scrivici prima di procedere.`,
    )
  }
}

/**
 * Esegue il cambio. `current` è la master key sbloccata adesso; `password` quella dell'account
 * (il server la pretende); `newMnemonic` le parole nuove, già confermate dall'utente.
 * Restituisce la master key nuova, non esportabile.
 */
export async function rotateRecoveryKey(
  deps: RecoveryRotationDeps,
  current: CryptoKey,
  password: string,
  newMnemonic: string,
  onProgress: (progress: RotationProgress) => void = () => {},
): Promise<CryptoKey> {
  const report = (stage: RotationStage, done = 0, total = 0) => onProgress({ stage, done, total })
  report('preparing')

  // La master key sbloccata deve essere quella dell'account adesso: se le parole sono già
  // cambiate da un altro dispositivo, ci si ferma prima di toccare qualcosa.
  const status = await deps.fetchStatus()
  if (!status.hasRecoveryKey || !status.verificationHash) {
    throw new RotationError('Questo account non ha ancora le 24 parole: creale dalle Impostazioni.')
  }
  const currentVerificationHash = status.verificationHash
  if (!(await verifyMasterKey(current, currentVerificationHash))) {
    throw new RotationError('Le 24 parole sono cambiate da un altro dispositivo: ricarica la pagina e sblocca con quelle nuove.')
  }

  const salt = generateSalt()
  const next = await deriveMasterKeyFromMnemonic(newMnemonic, salt)
  const rotationId = await deps.begin({
    password,
    currentVerificationHash,
    salt: arrayBufferToBase64(salt.slice().buffer),
    verificationHash: await createVerificationHash(next),
  })

  try {
    await stageAndCommit(deps, rotationId, current, next, report)
    return next
  } catch (err) {
    // Prima del commit niente è attivo: si chiude la rotazione e valgono le parole di sempre.
    await deps.cancel().catch(() => {})
    throw err
  }
}

async function stageAndCommit(
  deps: RecoveryRotationDeps,
  rotationId: string,
  current: CryptoKey,
  next: CryptoKey,
  report: (stage: RotationStage, done?: number, total?: number) => void,
): Promise<void> {
  // Due giri al massimo: il secondo serve solo se una chiave è arrivata fra l'elenco e il
  // commit. Ricifrare tutto di nuovo è idempotente.
  for (let round = 0; round < 2; round++) {
    await stageFileKeys(deps, rotationId, current, next, report)
    await stageBackups(deps, rotationId, current, next, report)
    report('activating')
    if ((await deps.commit(rotationId)) === 'committed') return
  }
  throw new RotationError('Durante il cambio sono arrivati file nuovi: riprova fra un momento.')
}

async function stageFileKeys(
  deps: RecoveryRotationDeps,
  rotationId: string,
  current: CryptoKey,
  next: CryptoKey,
  report: (stage: RotationStage, done?: number, total?: number) => void,
): Promise<void> {
  const stored = await deps.listFileKeys()
  const total = stored.length
  report('fileKeys', 0, total)

  const items: RotationFileKey[] = []
  let unreadable = 0
  for (const key of stored) {
    let fileKey: CryptoKey
    try {
      fileKey = await unwrapFileKey(key.wrappedKey, key.wrapIV, current, key.s3Key)
    } catch {
      unreadable++
      continue
    }
    // Sempre col formato con AAD: una chiave pre-#9 esce dalla rotazione legata al suo file.
    items.push({ s3Key: key.s3Key, ...(await wrapFileKey(fileKey, next, key.s3Key)) })
  }
  // Una chiave che la master key attuale non apre è già un file perso: attivare le parole nuove
  // senza di lei la farebbe sparire in silenzio.
  if (unreadable > 0) throw new RotationBlockedError(unreadable)

  let done = 0
  for (let i = 0; i < items.length; i += ROTATION_BATCH) {
    const batch = items.slice(i, i + ROTATION_BATCH)
    await deps.stageFileKeys(rotationId, batch)
    done += batch.length
    report('fileKeys', done, total)
  }
}

async function stageBackups(
  deps: RecoveryRotationDeps,
  rotationId: string,
  current: CryptoKey,
  next: CryptoKey,
  report: (stage: RotationStage, done?: number, total?: number) => void,
): Promise<void> {
  report('backups', 0, 2)
  const keypairBackup = await deps.fetchKeyPairBackup()
  const keypair = keypairBackup ? await rewrapPrivateKeyBackup(keypairBackup, current, next) : null
  report('backups', 1, 2)

  const xwingBackup = await deps.fetchXWingBackup()
  let xwing: XWingSeedBackup | null = null
  if (xwingBackup) {
    const seed = await unwrapXWingSeedWithMasterKey(xwingBackup, current)
    try {
      xwing = await wrapXWingSeedWithMasterKey(seed, next)
    } finally {
      seed.fill(0)
    }
  }
  await deps.stageBackups(rotationId, { keypair, xwing })
  report('backups', 2, 2)
}
