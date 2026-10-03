/**
 * Le 24 parole in un file di testo, scaricato dal browser: l'azione principale per metterle al
 * sicuro (gli appunti li leggono i gestori di clipboard e altre applicazioni). La usano la
 * creazione della chiave e il cambio delle parole.
 */
export function downloadRecoveryKeyFile(words: string[]): void {
  const content = [
    'Novren — chiave di recupero',
    '',
    "Queste 24 parole sono l'unico modo per riaprire i tuoi file se perdi",
    "l'accesso a questo dispositivo. Chi le possiede può leggere i tuoi file.",
    'Conservale offline. Non inviarle via email o chat.',
    '',
    `Generate il ${new Date().toLocaleString('it-IT')}`,
    '',
    ...words.map((word, index) => `${String(index + 1).padStart(2, '0')}. ${word}`),
  ].join('\n')

  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  // Il nome del file finisce sul disco dell'utente: è UI a tutti gli effetti.
  anchor.download = 'novren-chiave-di-recupero.txt'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
