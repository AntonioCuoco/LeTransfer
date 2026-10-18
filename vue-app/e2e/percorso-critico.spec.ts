import { test as base, expect, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

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
type Capture = { parts: Buffer[]; apiBodies: string[]; storageUrl: string }

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

// Si catturano i byte HTTP veri: WebKit non espone sempre i corpi Blob a postDataBuffer().
const test = base.extend<{ wireStorage: { url: string; parts: Buffer[] } }>({
  wireStorage: async ({}, use) => {
    const parts: Buffer[] = []
    const server = createServer(async (request, response) => {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, CORS_PREFLIGHT).end()
        return
      }
      const match = request.url?.match(/^\/part\/(\d+)$/)
      if (request.method !== 'PUT' || !match) { response.writeHead(404).end(); return }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      parts[Number(match[1]) - 1] = Buffer.concat(chunks)
      response.writeHead(200, { etag: '"etag-e2e"', ...CORS_RESPONSE }).end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      await use({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, parts })
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  },
})

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
    const urls = Object.fromEntries(body.partNumbers.map((n) => [n, `${capture.storageUrl}/part/${n}`]))
    await route.fulfill({ json: { urls } })
  })

  await page.route('**/api/guest/upload/complete', async (route: Route) => {
    capture.apiBodies.push(route.request().postData() ?? '')
    await route.fulfill({
      json: { publicToken: PUBLIC_TOKEN, url: `http://localhost:4173/share/${PUBLIC_TOKEN}`, expiresAt: null },
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

test.beforeEach(async ({ page, context, browserName }) => {
  // Solo Chromium espone questi permessi a Playwright. Negli altri motori si osserva
  // il confine appunti: questo e2e prova i byte e la crittografia, non gli appunti OS.
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(({ simulateClipboard }) => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    if (simulateClipboard) {
      let copied = ''
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => { copied = value },
          readText: async () => copied,
        },
      })
    }
  }, { simulateClipboard: browserName !== 'chromium' })
})

test('un file inviato senza account torna identico a chi lo riceve', async ({ page, wireStorage }) => {
  const capture: Capture = { parts: wireStorage.parts, apiBodies: [], storageUrl: wireStorage.url }
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
