import { apiBaseUrl, ApiError, logout as revokeToken, whoami } from '../api'
import { defaultDeviceName, forgetCredentials, loadCredentials, type Credentials } from '../config'
import { login as runLogin } from '../login'
import { info, interactive } from '../ui'
import { UserError } from './get'

/**
 * `novren login`, `novren logout`, `novren status`, e il collegamento automatico al primo
 * invio. Il token è **di questo computer**: si vede e si revoca dalle impostazioni del sito.
 */

export async function login(options: { deviceName?: string; deviceCode?: boolean }): Promise<void> {
  await runLogin({
    deviceName: options.deviceName?.trim() || defaultDeviceName(),
    ...(options.deviceCode ? { mode: 'device-code' as const } : {}),
  })
}

export async function logout(): Promise<void> {
  const saved = await loadCredentials(apiBaseUrl())
  if (!saved) {
    await forgetCredentials()
    info('Questo computer non era collegato.')
    return
  }
  // Prima si revoca sul server, poi si cancella qui. Se il server non risponde si cancella
  // comunque: chi fa logout vuole che il token sparisca da questo disco, subito.
  try {
    await revokeToken(saved.token)
  } catch (error) {
    if (!(error instanceof ApiError && error.code === 'CLI_TOKEN_INVALID')) {
      info('Non sono riuscito a revocare l’accesso su Novren: fallo dalle impostazioni del sito.')
    }
  }
  await forgetCredentials()
  info('Scollegato.')
}

export async function status(): Promise<void> {
  const saved = await loadCredentials(apiBaseUrl())
  if (!saved) {
    info('Non collegato. «novren login» per collegare questo computer.')
    return
  }
  try {
    const me = await whoami(saved.token)
    const until = new Date(me.expiresAt).toLocaleDateString('it-IT')
    if (me.kind === 'account') info(`Collegato all’account ${me.email ?? ''} come «${me.deviceName}» (fino al ${until}).`)
    else info(`Collegato senza account come «${me.deviceName}» (fino al ${until}).`)
  } catch (error) {
    if (error instanceof ApiError && error.code === 'CLI_TOKEN_INVALID') {
      await forgetCredentials()
      throw new UserError('L’accesso di questo computer è scaduto o è stato revocato: rifai «novren login».')
    }
    throw error
  }
}

/**
 * Le credenziali per inviare. Al primo invio da un terminale si collega il computer al volo
 * (si apre il browser, si sceglie, si torna qui); in uno script no: un processo senza
 * nessuno davanti non deve restare appeso ad aspettare un browser.
 */
export async function requireCredentials(): Promise<Credentials> {
  const saved = await loadCredentials(apiBaseUrl())
  if (saved) return saved
  if (!interactive()) {
    throw new UserError('Questo computer non è collegato a Novren: esegui prima «novren login».')
  }
  info('Per inviare, questo computer va collegato a Novren (una volta sola).')
  return runLogin({ deviceName: defaultDeviceName() })
}
