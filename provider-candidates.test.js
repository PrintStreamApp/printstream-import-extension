import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { afterEach, test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractProviderCandidates, probePrintablesDownloadUrl } from './provider-candidates.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const originalWindow = globalThis.window
const originalDocument = globalThis.document
const originalChrome = globalThis.chrome
const originalHtmlAnchorElement = globalThis.HTMLAnchorElement
const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout

afterEach(() => {
  globalThis.window = originalWindow
  globalThis.document = originalDocument
  globalThis.chrome = originalChrome
  globalThis.HTMLAnchorElement = originalHtmlAnchorElement
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
})

test('extractProviderCandidates finds Printables downloadable model links', async () => {
  const html = await awaitFixture('printables-model.html')

  const candidates = extractProviderCandidates({
    provider: 'printables',
    pageUrl: 'https://www.printables.com/model/1078334-pikachu-low-poly',
    html
  })

  assert.deepEqual(candidates.map((candidate) => candidate.name), ['thing.gcode.3mf', 'thing.stl'])
  assert.equal(candidates[0]?.printableStatus, 'printer-ready')
})

test('extractProviderCandidates finds MakerWorld print profiles from __NEXT_DATA__', () => {
  const html = `
    <html>
      <body>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
          props: {
            pageProps: {
              design: {
                instances: [
                  {
                    id: 33200,
                    profileId: 72850669,
                    title: 'ProClip V2',
                    appCanPrint: true
                  },
                  {
                    id: 33262,
                    profileId: 72850400,
                    title: 'ProClip V2 Low Profile',
                    appCanPrint: true
                  },
                  {
                    id: 99999,
                    profileId: 11111,
                    title: 'Raw STL only',
                    appCanPrint: false
                  }
                ]
              }
            }
          }
        })}</script>
      </body>
    </html>
  `

  const candidates = extractProviderCandidates({
    provider: 'makerworld',
    pageUrl: 'https://makerworld.com/en/models/30298-proclip-filament-clip?from=search#profileId-33200',
    html
  })

  assert.deepEqual(candidates.map((candidate) => candidate.name), ['ProClip V2 Low Profile.3mf', 'ProClip V2.3mf'])
  assert.equal(candidates[0]?.printableStatus, 'unknown')
  assert.equal(candidates[0]?.instanceId, 33262)
  assert.equal(candidates[0]?.profileId, 72850400)
  assert.equal(candidates[0]?.sourceUrl, 'https://makerworld.com/en/models/30298-proclip-filament-clip?from=search#profileId-33262')
})

test('extractProviderCandidates falls back to the selected MakerWorld profile from the URL hash', () => {
  const html = `
    <html>
      <head>
        <title>Steam 2026 Controller Stand | MakerWorld</title>
      </head>
      <body></body>
    </html>
  `

  const candidates = extractProviderCandidates({
    provider: 'makerworld',
    pageUrl: 'https://makerworld.com/en/models/2788119-steam-2026-controller-stand?from=recommend#profileId-3099811',
    html
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.instanceId, 3099811)
  assert.equal(candidates[0]?.sourceUrl, 'https://makerworld.com/en/models/2788119-steam-2026-controller-stand?from=recommend#profileId-3099811')
  assert.equal(candidates[0]?.name, 'Steam 2026 Controller Stand.3mf')
})

test('probePrintablesDownloadUrl resolves null when the injected probe does not answer', async () => {
  const listeners = new Set()
  globalThis.setTimeout = (callback) => {
    queueMicrotask(callback)
    return 1
  }
  globalThis.clearTimeout = () => {}
  globalThis.window = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener)
  }
  globalThis.HTMLAnchorElement = class HTMLAnchorElement {}
  globalThis.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`
    }
  }
  globalThis.document = {
    createElement: () => ({
      dataset: {},
      remove() {}
    }),
    documentElement: {
      appendChild() {}
    }
  }
  const button = {
    click() {},
    setAttribute(name, value) {
      this[name] = value
    }
  }

  const result = await probePrintablesDownloadUrl(button)

  assert.equal(result, null)
  assert.equal(button.__printstreamProbedUrl, null)
  assert.equal(listeners.size, 0)
})

function awaitFixture(name) {
  return readFile(join(fixturesDir, name), 'utf8')
}
