import { test, expect, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'

/**
 * Il percorso critico, in un browser vero: **cifra → carica → link → decifra**.
 *
 * È l'unico test che verifica la *promessa* del prodotto invece dei suoi pezzi. Gli
 * altri livelli controllano che ogni componente faccia la sua parte; qui si controlla
 * l'unica cosa che l'utente noterebbe: che il file che esce sia identico al file che è
 * entrato, e che nel mezzo il server non abbia mai visto né i byte né la chiave.
 *
 * **La rete è finta, la crittografia no.** Web Crypto, gli stream e le `Blob.slice`
 * girano davvero: sono esattamente i pezzi che un DOM simulato finge di eseguire.
 */

const PLAINTEXT = 'contenuto riservato — 0123456789 — fine'
const PUBLIC_TOKEN = 'tok3n-e2e'

/** I byte davvero caricati, catturati al volo dalle PUT verso lo "storage". */
type Capture = { parts: Buffer[]; apiBodies: string[] }

const CORS_PREFLIGHT = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'PUT,GET,HEAD,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-max-age': '86400',
}

const CORS_RESPONSE = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'ETag',
}

async function stubUpload(page: Page, capture: Capture) {
  await page.route('**/api/guest/upload/init', async (route: Route) => {
    capture.apiBodies.push(route.request().postData() ?? '')
    await route.fulfill({
      json: {
        transferId: 'transfer-e2e',
        publicToken: PUBLIC_TOKEN,
        manageToken: 'manage-e2e',
        uploadId: 'upload-e2e',
        fileKey: `uploads/guest/transfer-e2e/file`,
      },
    })
  })

  await page.route('**/api/guest/upload/urls', async (route: Route) => {
    capture.apiBodies.push(route.request().postData() ?? '')
    const body = JSON.parse(route.request().postData() ?? '{}') as { partNumbers: number[] }
    const urls = Object.fromEntries(body.partNumbers.map((n) => [n, `https://storage.test/part/${n}`]))
    await route.fulfill({ json: { urls } })
  })

  await page.route('**/api/guest/upload/complete', async (route: Route) => {
    capture.apiBodies.push(route.request().postData() ?? '')
    await route.fulfill({
      json: { publicToken: PUBLIC_TOKEN, url: `http://localhost:4173/share/${PUBLIC_TOKEN}`, expiresAt: null },
    })
  })

  await page.route('https://storage.test/part/**', async (route: Route) => {
    // Un PUT cross-origin con `application/octet-stream` non è una richiesta "semplice":
    // il browser manda prima un preflight. Lo stub lo riproduce di proposito, perché è
    // la stessa configurazione che il bucket vero deve avere — **`ETag` esposto
    // compreso**, senza il quale il multipart non può ricomporre l'oggetto
    // (BACKEND_API_DOCS §5-bis, punto 2 del cutover R2).
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_PREFLIGHT })
      return
    }
    capture.parts.push(route.request().postDataBuffer() ?? Buffer.alloc(0))
    await route.fulfill({
      status: 200,
      headers: { etag: '"etag-e2e"', ...CORS_RESPONSE },
    })
  })
}

async function stubReceive(page: Page, ciphertext: Buffer, originalSize: number) {
  await page.route(`**/api/shared-links/${PUBLIC_TOKEN}`, async (route: Route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          publicToken: PUBLIC_TOKEN,
          fileName: 'nota-riservata.txt',
          fileSize: `${originalSize} B`,
          fileType: 'text/plain',
          isPasswordProtected: false,
          expiresAt: null,
          downloadCount: 0,
          formatVersion: 2,
          chunkSize: 10 * 1024 * 1024,
          originalSize,
        },
      },
    })
  })

  await page.route(`**/api/shared-links/${PUBLIC_TOKEN}/access`, async (route: Route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { sessionToken: 'sess-e2e', expiresAt: new Date(Date.now() + 3600_000).toISOString(), previewSupported: false },
      },
    })
  })

  await page.route(`**/api/shared-links/${PUBLIC_TOKEN}/file**`, async (route: Route) => {
    await route.fulfill({ json: { success: true, data: { url: 'https://storage.test/download' } } })
  })

  await page.route('https://storage.test/download', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_PREFLIGHT })
      return
    }
    await route.fulfill({
      status: 200,
      body: ciphertext,
      headers: { 'content-type': 'application/octet-stream', ...CORS_RESPONSE },
    })
  })
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  // Chromium headless espone `showSaveFilePicker`, che aprirebbe un selettore e
  // bloccherebbe il test. Togliendolo si esercita il percorso di ripiego (blob +
  // ancora), che è anche quello che ricevono davvero gli utenti di Firefox e Safari.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
})

test('un file inviato senza account torna identico a chi lo riceve', async ({ page }) => {
  const capture: Capture = { parts: [], apiBodies: [] }
  await stubUpload(page, capture)

  // ── Invio ────────────────────────────────────────────────────────────────────
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Impossibile/ })).toBeVisible()

  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({
    name: 'nota-riservata.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(PLAINTEXT, 'utf8'),
  })
  await expect(page.getByText('nota-riservata.txt')).toBeVisible()

  await page.getByRole('button', { name: 'Cifra e crea il link' }).click()
  await expect(page.getByText('Link pronto')).toBeVisible({ timeout: 15_000 })

  // ── La promessa, verificata sui byte veri ────────────────────────────────────
  const uploaded = Buffer.concat(capture.parts)
  expect(uploaded.length).toBeGreaterThan(0)
  expect(uploaded.includes(Buffer.from(PLAINTEXT, 'utf8'))).toBe(false)
  expect(uploaded.toString('latin1')).not.toContain('contenuto riservato')

  await page.getByRole('button', { name: 'Copia' }).click()
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText())
  expect(shareUrl).toContain(`/share/${PUBLIC_TOKEN}#key=`)

  const fragment = shareUrl.split('#')[1]
  const key = decodeURIComponent(new URLSearchParams(fragment).get('key') ?? '')
  expect(key.length).toBeGreaterThan(20)
  // La chiave non è mai comparsa in una richiesta al nostro server.
  expect(capture.apiBodies.join('\n')).not.toContain(key)

  // ── Ricezione ────────────────────────────────────────────────────────────────
  await stubReceive(page, uploaded, Buffer.byteLength(PLAINTEXT, 'utf8'))
  await page.goto(`/share/${PUBLIC_TOKEN}#${fragment}`)

  await expect(page.getByRole('heading', { name: 'nota-riservata.txt' })).toBeVisible()
  await page.getByPlaceholder('Il tuo nome').fill('Destinataria')
  await page.getByRole('button', { name: 'Apri il file' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Decifra e scarica' }).click()
  const download = await downloadPromise

  const saved = readFileSync(await download.path())
  expect(saved.toString('utf8')).toBe(PLAINTEXT)
})

test('senza la chiave nel frammento il file non si apre', async ({ page }) => {
  await stubReceive(page, Buffer.from('ciphertext-finto'), 16)

  // Stesso link, senza `#key=…`: è il caso di chi copia l'URL dalla barra degli
  // indirizzi troncandolo, o di chi lo riceve da un client che mangia il frammento.
  await page.goto(`/share/${PUBLIC_TOKEN}`)

  await expect(page.getByRole('heading', { name: 'nota-riservata.txt' })).toBeVisible()
  // Nessuna promessa di decifratura: la riga "si decifra nel tuo browser" c'è solo
  // quando la chiave è effettivamente presente.
  await expect(page.getByText('si decifra nel tuo browser')).toHaveCount(0)
})

test('la facciata avvisa quando un file si traveste, e chiede conferma', async ({ page }) => {
  await page.goto('/')

  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({
    name: 'vacanze.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00]), // intestazione di un eseguibile Windows
  })

  await expect(page.getByText('Il contenuto non è quello che dice l’estensione')).toBeVisible()
  const confirmButton = page.getByRole('button', { name: 'Conferma per procedere' })
  await expect(confirmButton).toBeDisabled()

  await page.getByRole('checkbox').check()
  await expect(page.getByRole('button', { name: 'Cifra e crea il link' })).toBeEnabled()
})
