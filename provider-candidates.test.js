import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { afterEach, test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCandidate, extractPrintablesFileThumbnail, extractProviderCandidates, fetchMakerWorldCandidates, probePrintablesDownloadUrl } from './provider-candidates.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const originalWindow = globalThis.window
const originalDocument = globalThis.document
const originalChrome = globalThis.chrome
const originalHtmlAnchorElement = globalThis.HTMLAnchorElement
const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout
const originalLocation = globalThis.location

afterEach(() => {
  globalThis.location = originalLocation
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

  // #profileId-33200 is the profile the page has selected, so it leads the list.
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['ProClip V2.3mf', 'ProClip V2 Low Profile.3mf'])
  assert.equal(candidates[0]?.printableStatus, 'unknown')
  assert.equal(candidates[0]?.instanceId, 33200)
  assert.equal(candidates[0]?.profileId, 72850669)
  assert.equal(candidates[0]?.sourceUrl, 'https://makerworld.com/en/models/30298-proclip-filament-clip?from=search#profileId-33200')
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

test('extractProviderCandidates carries per-instance covers and falls back to og:image', () => {
  const html = `
    <html>
      <head>
        <meta property="og:image" content="https://public-cdn.bblmw.com/page-cover.png" />
      </head>
      <body>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
          props: {
            pageProps: {
              design: {
                instances: [
                  { id: 1, profileId: 10, title: 'With cover', appCanPrint: true, cover: 'https://public-cdn.bblmw.com/instance.png' },
                  { id: 2, profileId: 20, title: 'No cover', appCanPrint: true },
                  { id: 3, profileId: 30, title: 'Insecure cover', appCanPrint: true, cover: 'http://public-cdn.bblmw.com/x.png' }
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
    pageUrl: 'https://makerworld.com/en/models/30298',
    html
  })
  const byName = new Map(candidates.map((candidate) => [candidate.name, candidate]))

  assert.equal(byName.get('With cover.3mf')?.thumbnailUrl, 'https://public-cdn.bblmw.com/instance.png')
  assert.equal(byName.get('No cover.3mf')?.thumbnailUrl, 'https://public-cdn.bblmw.com/page-cover.png')
  // http covers are dropped, not downgraded silently onto the card.
  assert.equal(byName.get('Insecure cover.3mf')?.thumbnailUrl, 'https://public-cdn.bblmw.com/page-cover.png')
})

test('extractProviderCandidates leaves thumbnailUrl null when the page has no og:image', async () => {
  const html = await awaitFixture('printables-model.html')

  const candidates = extractProviderCandidates({
    provider: 'printables',
    pageUrl: 'https://www.printables.com/model/1078334-pikachu-low-poly',
    html
  })

  assert.equal(candidates[0]?.thumbnailUrl, null)
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

test('extractProviderCandidates drops Printables files belonging to another model', () => {
  const html = `
    <html><body>
      <a href="https://files.printables.com/media/prints/111/stls/old.stl">old.stl</a>
      <a href="https://files.printables.com/media/prints/222/stls/new.stl">new.stl</a>
      <a href="https://files.printables.com/no-id/loose.stl">loose.stl</a>
    </body></html>
  `

  const candidates = extractProviderCandidates({
    provider: 'printables',
    pageUrl: 'https://www.printables.com/model/222-foo/files',
    html
  })

  assert.deepEqual(candidates.map((candidate) => candidate.name).sort(), ['loose.stl', 'new.stl'])
})

test('probePrintablesDownloadUrl re-probes the same button after the model URL changes', async () => {
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
  globalThis.chrome = { runtime: { getURL: (path) => `chrome-extension://test/${path}` } }
  globalThis.document = {
    createElement: () => ({ dataset: {}, remove() {} }),
    documentElement: { appendChild() {} }
  }
  globalThis.location = { href: 'https://www.printables.com/model/111-old/files' }
  const button = {
    click() {},
    setAttribute(name, value) { this[name] = value }
  }

  await probePrintablesDownloadUrl(button)
  button.__printstreamProbedUrl = 'https://files.printables.com/media/prints/111/stls/old.stl'
  const firstKey = button.__printstreamProbedKey

  globalThis.location = { href: 'https://www.printables.com/model/222-new/files' }
  const second = await probePrintablesDownloadUrl(button)

  assert.notEqual(button.__printstreamProbedKey, firstKey)
  assert.equal(second, null)
})

test('extractPrintablesFileThumbnail prefers the densest srcset entry from a download row', () => {
  const thumb90 = 'https://media.printables.com/media/prints/84b5/previews/thumbs/cover/90x90/png/7dc1.webp'
  const thumb180 = 'https://media.printables.com/media/prints/84b5/previews/thumbs/cover/180x180/png/7dc1.webp'
  const row = {
    querySelector: (selector) => selector.startsWith('picture')
      ? { getAttribute: () => `${thumb90} 1x, ${thumb180} 2x` }
      : { getAttribute: () => thumb90 }
  }

  assert.equal(extractPrintablesFileThumbnail(row), thumb180)
  // No <picture>: fall back to the plain img src, and never blow up on a detached node.
  assert.equal(extractPrintablesFileThumbnail({ querySelector: (s) => s.startsWith('picture') ? null : { getAttribute: () => thumb90 } }), thumb90)
  assert.equal(extractPrintablesFileThumbnail(null), null)
  // The URL still has to survive buildCandidate's https/length check.
  assert.equal(buildCandidate({ provider: 'printables', sourceUrl: 'https://x/y.stl', name: 'y.stl', thumbnailUrl: thumb180 }).thumbnailUrl, thumb180)
})

test('fetchMakerWorldCandidates lists every printable profile and keeps the selected one first', async () => {
  const design = {
    id: 2648462,
    coverUrl: 'https://makerworld.bblmw.com/makerworld/model/x/design/cover.jpeg',
    instances: [
      { id: 2929450, profileId: 708114690, title: '2x Stopper @A1', appCanPrint: true },
      { id: 2927608, profileId: 707549096, title: 'KOOPLA Clip', appCanPrint: true, cover: 'https://makerworld.bblmw.com/makerworld/model/x/instance/clip.jpeg' },
      { id: 2927628, profileId: 707540741, title: 'BIQU Handle', appCanPrint: true },
      { id: 9999999, profileId: 1, title: 'Not printable', appCanPrint: false }
    ]
  }
  const requests = []
  const fetchImpl = async (url, init) => {
    requests.push({ url, init })
    return { ok: true, json: async () => design }
  }
  const pageUrl = 'https://makerworld.com/en/models/2648462-the-ultimate-accessories?from=recommend#profileId-2927608'

  const candidates = await fetchMakerWorldCandidates({ pageUrl, fetchImpl })

  assert.equal(requests[0].url, 'https://makerworld.com/api/v1/design-service/design/2648462')
  assert.equal(requests[0].init.credentials, 'include')
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['KOOPLA Clip.3mf', '2x Stopper @A1.3mf', 'BIQU Handle.3mf'])
  assert.equal(candidates[0].instanceId, 2927608)
  assert.equal(candidates[0].thumbnailUrl, 'https://makerworld.bblmw.com/makerworld/model/x/instance/clip.jpeg')
  // No per-instance cover: fall back to the design cover.
  assert.equal(candidates[1].thumbnailUrl, design.coverUrl)

  // The injection loop re-extracts constantly; the design response is fetched once.
  await fetchMakerWorldCandidates({ pageUrl, fetchImpl })
  assert.equal(requests.length, 1)
})

test('fetchMakerWorldCandidates stays empty and retries when the design service fails', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return calls === 1 ? { ok: false, status: 403, json: async () => ({}) } : { ok: true, json: async () => ({ instances: [{ id: 5, profileId: 6, title: 'Later', appCanPrint: true }] }) }
  }
  const pageUrl = 'https://makerworld.com/en/models/7777777-late-loader'

  assert.deepEqual(await fetchMakerWorldCandidates({ pageUrl, fetchImpl }), [])
  const retried = await fetchMakerWorldCandidates({ pageUrl, fetchImpl })

  assert.equal(calls, 2)
  assert.deepEqual(retried.map((candidate) => candidate.name), ['Later.3mf'])
  assert.deepEqual(await fetchMakerWorldCandidates({ pageUrl: 'https://makerworld.com/en/no-model-here', fetchImpl }), [])
  assert.equal(calls, 2)
})

function awaitFixture(name) {
  return readFile(join(fixturesDir, name), 'utf8')
}
