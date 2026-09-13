import { ref } from 'vue'
import Cookies from 'js-cookie'
import {
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient, handleCognitoError } from '@/src/utils/cognitoClient'

/**
 * Verifica in due passaggi (TOTP).
 *
 * **Perché conta qui più che altrove.** In un prodotto zero-knowledge chi ruba la password
 * **non può leggere i tuoi file**: la chiave privata sta nell'IndexedDB del tuo browser e
 * il backup vuole la mnemonica di recupero. Il suo potere è un altro — entrare, revocare
 * link, e soprattutto **cancellare l'account**, che da noi è irreversibile per costruzione.
 * Il secondo fattore è la difesa che chiude esattamente quel caso.
 *
 * **Perché è tutto lato client.** L'app parla direttamente con Cognito attraverso l'SDK
 * (`InitiateAuthCommand` nel login), e Cognito gestisce il TOTP da sé: associazione del
 * segreto, verifica del codice, preferenza MFA e challenge al login. Non serve nessun
 * endpoint nuovo sul nostro backend — che è anche il motivo per cui questa funzione si
 * poteva accendere da mesi.
 *
 * ⚠️ **Prerequisito di configurazione, non di codice.** Il User Pool deve avere l'MFA su
 * *opzionale* e **TOTP abilitato**. Senza, `AssociateSoftwareTokenCommand` fallisce e non
 * c'è riga di codice che possa rimediare. È una casella nella console AWS.
 *
 * **Cosa NON protegge**, e va detto all'utente: non protegge i file. Se perdi il
 * dispositivo con l'app di autenticazione **e** non hai la chiave di recupero, il secondo
 * fattore non ti riporta dentro — e nessuno può farlo al posto tuo. Le due cose vivono su
 * piani diversi: il TOTP difende l'*accesso*, la mnemonica difende i *dati*.
 */

export type TwoFactorStatus = 'unknown' | 'off' | 'on'

/** Cognito ha risposto, e ha detto che il codice non va (Status diverso da SUCCESS). */
const CODE_REJECTED = 'Il codice non è stato accettato: controlla che l’ora del telefono sia giusta e usa quello nuovo.'

export function useTwoFactor() {
  const status = ref<TwoFactorStatus>('unknown')
  const isBusy = ref(false)
  const errorMessage = ref<string | null>(null)

  /** Il segreto da mostrare durante l'attivazione, e l'URI per il QR. */
  const secret = ref<string | null>(null)
  const otpauthUri = ref<string | null>(null)

  // La sessione di associazione: Cognito la restituisce e la richiede alla verifica.
  let associationSession: string | null = null

  const accessToken = () => Cookies.get('accessToken') ?? null

  async function refreshStatus(): Promise<void> {
    const token = accessToken()
    if (!token) return
    try {
      const user = await cognitoClient.send(new GetUserCommand({ AccessToken: token }))
      const enabled =
        user.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA') ||
        user.PreferredMfaSetting === 'SOFTWARE_TOKEN_MFA'
      status.value = enabled ? 'on' : 'off'
    } catch {
      // Non trasformiamo un problema di rete in "disattivata": sarebbe una bugia
      // rassicurante nella direzione sbagliata.
      status.value = 'unknown'
    }
  }

  /**
   * Passo 1 — chiede a Cognito un segreto TOTP e costruisce l'URI `otpauth://` da cui
   * nasce il QR. L'`issuer` è il nome pubblico: è ciò che l'utente vedrà nell'app di
   * autenticazione, ed è quello che deve riconoscere fra venti voci.
   */
  async function beginSetup(userEmail: string): Promise<boolean> {
    const token = accessToken()
    if (!token) return false

    isBusy.value = true
    errorMessage.value = null
    try {
      const res = await cognitoClient.send(new AssociateSoftwareTokenCommand({ AccessToken: token }))
      if (!res.SecretCode) throw new Error('Cognito non ha restituito il segreto')

      associationSession = res.Session ?? null
      secret.value = res.SecretCode
      otpauthUri.value =
        `otpauth://totp/Novren:${encodeURIComponent(userEmail)}` +
        `?secret=${res.SecretCode}&issuer=Novren&algorithm=SHA1&digits=6&period=30`
      return true
    } catch (error) {
      errorMessage.value = handleCognitoError(error)
      return false
    } finally {
      isBusy.value = false
    }
  }

  /**
   * Passo 2 — verifica il codice a sei cifre e, se torna, rende il TOTP il fattore
   * preferito. I due comandi stanno insieme di proposito: un segreto verificato ma non
   * impostato come preferito lascerebbe l'utente convinto di avere la 2FA attiva mentre
   * il login continua a non chiederla.
   */
  async function confirmSetup(code: string): Promise<boolean> {
    const token = accessToken()
    if (!token) return false

    isBusy.value = true
    errorMessage.value = null
    try {
      const verify = await cognitoClient.send(
        new VerifySoftwareTokenCommand({
          AccessToken: token,
          UserCode: code.trim(),
          ...(associationSession ? { Session: associationSession } : {}),
        }),
      )
      if (verify.Status !== 'SUCCESS') {
        errorMessage.value = CODE_REJECTED
        return false
      }

      await cognitoClient.send(
        new SetUserMFAPreferenceCommand({
          AccessToken: token,
          SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
        }),
      )

      status.value = 'on'
      secret.value = null
      otpauthUri.value = null
      associationSession = null
      return true
    } catch (error) {
      errorMessage.value = handleCognitoError(error)
      return false
    } finally {
      isBusy.value = false
    }
  }

  /**
   * Disattivazione. Cognito qui si accontenta dell'access token, ma noi chiediamo comunque
   * un codice valido prima di chiamare: disattivare la 2FA con la sola sessione la
   * renderebbe inutile proprio contro l'attaccante da cui dovrebbe difendere.
   */
  async function disable(): Promise<boolean> {
    const token = accessToken()
    if (!token) return false

    isBusy.value = true
    errorMessage.value = null
    try {
      await cognitoClient.send(
        new SetUserMFAPreferenceCommand({
          AccessToken: token,
          SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
        }),
      )
      status.value = 'off'
      return true
    } catch (error) {
      errorMessage.value = handleCognitoError(error)
      return false
    } finally {
      isBusy.value = false
    }
  }

  /** Verifica un codice senza cambiare nulla: serve a proteggere la disattivazione. */
  async function checkCode(code: string): Promise<boolean> {
    const token = accessToken()
    if (!token) return false
    errorMessage.value = null
    try {
      const res = await cognitoClient.send(
        new VerifySoftwareTokenCommand({ AccessToken: token, UserCode: code.trim() }),
      )
      if (res.Status === 'SUCCESS') return true
      errorMessage.value = CODE_REJECTED
      return false
    } catch (error) {
      // Prima qualunque errore diventava «codice non valido», anche una sessione scaduta.
      errorMessage.value = handleCognitoError(error)
      return false
    }
  }

  return {
    status,
    isBusy,
    errorMessage,
    secret,
    otpauthUri,
    refreshStatus,
    beginSetup,
    confirmSetup,
    disable,
    checkCode,
  }
}
