/* global chrome, document, window */
import { normalizePrintablesModelUrl } from './page-binding.js'
import { MAKERWORLD_REQUEST_HEADERS } from './provider-downloads.js'

const DIRECT_PRINT_SUFFIXES = ['.gcode.3mf', '.gcode']
const IMPORT_SUFFIXES = ['.gcode.3mf', '.gcode', '.3mf', '.stl', '.zip', '.7z', '.rar']
const PRINTABLES_PROBE_TIMEOUT_MS = 5000

export function extractProviderCandidates({ provider, pageUrl, html }) {
  if (provider === 'makerworld') {
    const makerWorldCandidates = extractMakerWorldCandidates(pageUrl, html)
    if (makerWorldCandidates.length > 0) return rankCandidates(makerWorldCandidates)
    const makerWorldHashFallback = extractMakerWorldCandidateFromUrl(pageUrl, html)
    if (makerWorldHashFallback.length > 0) return rankCandidates(makerWorldHashFallback)
  }

  const links = extractLinks(html)
  const pageThumbnailUrl = extractOpenGraphImage(html)
  const seen = new Set()
  const candidates = []
  for (const link of links) {
    const sourceUrl = resolveUrl(link.href, pageUrl)
    if (!sourceUrl) continue
    const name = fileNameFromUrl(sourceUrl) ?? fileNameFromText(link.label)
    if (!name || !isSupportedImportName(name) || seen.has(sourceUrl)) continue
    seen.add(sourceUrl)
    candidates.push(buildCandidate({ provider, sourceUrl, name, thumbnailUrl: pageThumbnailUrl }))
  }
  return rankCandidates(
    provider === 'printables'
      ? candidates.filter((candidate) => belongsToPrintablesModel(candidate.sourceUrl, pageUrl))
      : candidates
  )
}

// Printables is a SPA, so markup from the previously viewed model can still be in the
// DOM when we scrape it. File URLs embed the model id, so drop anything that belongs to
// another model. ponytail: URLs with no id in the path pass through rather than risk
// dropping real candidates.
function belongsToPrintablesModel(sourceUrl, pageUrl) {
  const fileModelId = /\/media\/prints\/(\d+)\//i.exec(sourceUrl)?.[1]
  if (!fileModelId) return true
  const pageModelId = /\/model\/(\d+)/i.exec(pageUrl ?? '')?.[1]
  return pageModelId == null || fileModelId === pageModelId
}

let printablesProbeLock = Promise.resolve()

export async function extractPrintablesCandidatesFromDocument() {
  // We no longer probe buttons on page load to prevent unintended downloads.
  // The candidates are extracted on-demand when the user clicks an injected action.
  return []
}

/**
 * Per-file preview image from a Printables `.download-item` row. The srcset carries a 2x
 * (180x180) variant, so prefer its last entry over the 90x90 `img src`.
 */
export function extractPrintablesFileThumbnail(row) {
  if (typeof row?.querySelector !== 'function') return null
  const srcset = row.querySelector('picture source[srcset]')?.getAttribute('srcset')
  const densest = srcset?.split(',').map((entry) => entry.trim().split(/\s+/)[0]).filter(Boolean).at(-1)
  return densest ?? row.querySelector('img[src]')?.getAttribute('src') ?? null
}

export function buildCandidate({ provider, sourceUrl, name, thumbnailUrl }) {
  const fileType = fileTypeForName(name)
  const printableStatus = DIRECT_PRINT_SUFFIXES.some((suffix) => name.toLowerCase().endsWith(suffix))
    ? 'printer-ready'
    : fileType === 'stl'
      ? 'needs-slicing'
      : 'unknown'
  return {
    id: `${name}:${sourceUrl}`,
    provider,
    sourceUrl,
    name,
    sizeBytes: null,
    fileType,
    printableStatus,
    confidence: 0.85,
    recommendationReason: recommendationReason(name, fileType, printableStatus),
    thumbnailUrl: normalizeThumbnailUrl(thumbnailUrl)
  }
}

// Candidates ride to PrintStream in a query string, so an absurdly long cover URL
// costs the whole handoff. Drop the picture instead of truncating it into garbage.
const MAX_THUMBNAIL_URL_LENGTH = 500

function normalizeThumbnailUrl(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = decodeHtmlEntities(raw.trim())
  if (trimmed.length === 0 || trimmed.length > MAX_THUMBNAIL_URL_LENGTH) return null
  try {
    // https only: PrintStream renders this as an <img src>, and the receiving side
    // re-checks it (sanitizeRemoteImportThumbnailUrl) rather than trusting us.
    return new URL(trimmed).protocol === 'https:' ? trimmed : null
  } catch {
    return null
  }
}

/** Page-level cover, used for providers and fallback paths with no per-file image. */
function extractOpenGraphImage(html) {
  const match = /<meta\b[^>]*\bproperty\s*=\s*["']og:image["'][^>]*>/i.exec(html ?? '')
  const content = match?.[0] ? /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(match[0]) : null
  return normalizeThumbnailUrl(content?.[1] ?? content?.[2] ?? null)
}

// MakerWorld renames this field between releases, so try the shapes we have seen
// and let the og:image fallback cover the rest.
function extractInstanceCover(instance) {
  for (const value of [instance?.cover, instance?.coverUrl, instance?.coverPc, instance?.image]) {
    const normalized = normalizeThumbnailUrl(value)
    if (normalized) return normalized
  }
  return null
}

function extractLinks(html) {
  const links = []
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi
  let anchorMatch
  while ((anchorMatch = anchorPattern.exec(html)) != null) {
    const href = anchorMatch[1] || anchorMatch[2] || anchorMatch[3]
    if (href) {
      links.push({
        href,
        label: htmlToText(anchorMatch[4] ?? '')
      })
    }
  }

  const hrefPattern = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi
  let match
  while ((match = hrefPattern.exec(html)) != null) {
    const href = match[1] || match[2] || match[3]
    if (href) links.push({ href, label: '' })
  }
  return links
}

function resolveUrl(href, pageUrl) {
  try {
    return new URL(href, pageUrl).toString()
  } catch {
    return null
  }
}

export function fileNameFromUrl(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl)
    const last = parsed.pathname.split('/').filter(Boolean).at(-1)
    const pathName = last ? cleanFileName(decodeURIComponent(last)) : null
    if (pathName && isSupportedImportName(pathName)) return pathName

    for (const value of parsed.searchParams.values()) {
      const queryName = fileNameFromText(value)
      if (queryName) return queryName
      const nestedUrl = resolveUrl(value, sourceUrl)
      if (!nestedUrl) continue
      const nestedName = fileNameFromUrl(nestedUrl)
      if (nestedName) return nestedName
    }
    return null
  } catch {
    return null
  }
}

function fileNameFromText(text) {
  const match = /([\w][\w .()+-]*?\.(?:gcode\.3mf|gcode|3mf|stl|zip|7z|rar))\b/i.exec(decodeHtmlEntities(text))
  return match?.[1] ? cleanFileName(match[1]) : null
}

function cleanFileName(raw) {
  return raw.replace(/\\/g, '/').split('/').at(-1)?.trim() ?? null
}

function htmlToText(html) {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function isSupportedImportName(name) {
  const lower = name.toLowerCase()
  return IMPORT_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}

function fileTypeForName(name) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.gcode') || lower.endsWith('.gcode.3mf')) return 'gcode'
  if (lower.endsWith('.3mf')) return '3mf'
  if (lower.endsWith('.stl')) return 'stl'
  if (lower.endsWith('.zip') || lower.endsWith('.7z') || lower.endsWith('.rar')) return 'archive'
  return 'other'
}

function rankCandidates(candidates) {
  return [...candidates].sort((left, right) => {
    const priorityDelta = priority(right) - priority(left)
    if (priorityDelta !== 0) return priorityDelta
    const confidenceDelta = right.confidence - left.confidence
    if (confidenceDelta !== 0) return confidenceDelta
    return left.name.localeCompare(right.name)
  })
}

function priority(candidate) {
  const lower = candidate.name.toLowerCase()
  if (lower.endsWith('.gcode.3mf')) return 600
  if (lower.endsWith('.gcode')) return 500
  if (candidate.fileType === '3mf') return 400
  if (candidate.fileType === 'stl') return 300
  if (candidate.fileType === 'archive') return 100
  return 0
}

function recommendationReason(name, fileType, printableStatus) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.gcode.3mf')) return 'Bambu sliced 3MF can be sent directly to a printer.'
  if (lower.endsWith('.gcode')) return 'G-code can be sent directly to a printer.'
  if (fileType === 'stl') return 'Mesh files import to the library and require slicing before printing.'
  if (printableStatus === 'unknown') return 'Import to the library; direct printing requires printer-ready sliced output.'
  return 'Fallback import candidate.'
}

function extractMakerWorldCandidates(pageUrl, html) {
  const nextData = parseMakerWorldNextData(html)
  const instances = nextData?.props?.pageProps?.design?.instances
  if (!Array.isArray(instances)) return []
  return buildMakerWorldInstanceCandidates(pageUrl, instances, extractOpenGraphImage(html))
}

/**
 * MakerWorld renders model pages on the client now, so `__NEXT_DATA__` is usually gone and
 * only the profile in the URL hash survives HTML scraping. The design service still lists
 * every print profile (with its own cover), so ask it directly.
 */
export async function fetchMakerWorldCandidates({ pageUrl, html = '', fetchImpl = fetch }) {
  const designId = /\/models\/(\d+)/i.exec(pageUrl ?? '')?.[1]
  if (!designId) return []

  // The injection loop re-extracts on every DOM mutation, so cache the design response per
  // model. ponytail: unbounded Map, a tab only ever visits a handful of models.
  if (!makerWorldDesignCache.has(designId)) {
    makerWorldDesignCache.set(designId, fetchMakerWorldDesign(designId, pageUrl, fetchImpl))
  }
  const design = await makerWorldDesignCache.get(designId)
  const instances = design?.instances ?? design?.design?.instances
  if (!Array.isArray(instances)) return []

  return rankCandidates(buildMakerWorldInstanceCandidates(
    pageUrl,
    instances,
    extractOpenGraphImage(html) ?? normalizeThumbnailUrl(design?.coverUrl)
  ))
}

const makerWorldDesignCache = new Map()

async function fetchMakerWorldDesign(designId, pageUrl, fetchImpl) {
  try {
    const endpoint = new URL(`/api/v1/design-service/design/${designId}`, pageUrl).toString()
    const response = await fetchImpl(endpoint, {
      credentials: 'include',
      headers: MAKERWORLD_REQUEST_HEADERS
    })
    if (!response.ok) {
      makerWorldDesignCache.delete(designId)
      return null
    }
    return await response.json()
  } catch {
    makerWorldDesignCache.delete(designId)
    return null
  }
}

function buildMakerWorldInstanceCandidates(pageUrl, instances, pageThumbnailUrl) {
  // The profile the page has selected (Open in Bambu Studio / #profileId-...) should stay
  // first in the list, the rest ride along so PrintStream can offer them.
  const selectedInstanceId = normalizePositiveInteger(/(?:^|#)profileId-(\d+)(?:\b|$)/i.exec(pageUrl ?? '')?.[1])
  const seen = new Set()
  const candidates = []
  for (const instance of instances) {
    const instanceId = normalizePositiveInteger(instance?.id)
    const profileId = normalizePositiveInteger(instance?.profileId)
    if (instanceId == null || profileId == null) continue
    if (instance?.appCanPrint !== true) continue

    const sourceUrl = buildMakerWorldProfileUrl(pageUrl, instanceId)
    if (seen.has(sourceUrl)) continue
    seen.add(sourceUrl)

    const title = typeof instance?.title === 'string' && instance.title.trim().length > 0
      ? instance.title.trim()
      : `MakerWorld profile ${instanceId}`

    candidates.push({
      ...buildCandidate({
        provider: 'makerworld',
        sourceUrl,
        name: `${title}.3mf`,
        thumbnailUrl: extractInstanceCover(instance) ?? pageThumbnailUrl
      }),
      confidence: instanceId === selectedInstanceId ? 0.99 : 0.95,
      instanceId,
      profileId
    })
  }

  return candidates
}

function extractMakerWorldCandidateFromUrl(pageUrl, html) {
  let parsed
  try {
    parsed = new URL(pageUrl)
  } catch {
    return []
  }

  const hashMatch = /(?:^|#)profileId-(\d+)(?:\b|$)/i.exec(parsed.hash)
  const instanceId = normalizePositiveInteger(hashMatch?.[1])
  if (instanceId == null) return []

  const title = extractTitle(html)
  const baseName = title && title.length > 0 ? title : `MakerWorld profile ${instanceId}`
  return [{
    ...buildCandidate({
      provider: 'makerworld',
      sourceUrl: parsed.toString(),
      name: `${baseName}.3mf`,
      thumbnailUrl: extractOpenGraphImage(html)
    }),
    confidence: 0.7,
    instanceId,
    profileId: instanceId
  }]
}

function parseMakerWorldNextData(html) {
  const match = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)
  if (!match?.[1]) return null

  try {
    return JSON.parse(decodeHtmlEntities(match[1]))
  } catch {
    return null
  }
}

function buildMakerWorldProfileUrl(pageUrl, instanceId) {
  const parsed = new URL(pageUrl)
  parsed.hash = `profileId-${instanceId}`
  return parsed.toString()
}

function extractTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const text = match?.[1] ? htmlToText(match[1]) : ''
  if (!text) return null
  return text.replace(/\s*\|\s*MakerWorld\s*$/i, '').trim() || null
}

function normalizePositiveInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10)
    return parsed > 0 ? parsed : null
  }
  return null
}

export async function probePrintablesDownloadUrl(button) {
  // Nuxt reuses download-button nodes across model routes, so a memo from model A would
  // otherwise be served on model B. Key it to the model URL that produced it.
  const memoKey = normalizePrintablesModelUrl(globalThis.location?.href ?? '')
  if (button.__printstreamProbedKey === memoKey && button.__printstreamProbedUrl !== undefined) {
    return button.__printstreamProbedUrl
  }
  button.__printstreamProbedKey = memoKey
  button.__printstreamProbedUrl = undefined

  const browserWindow = globalThis.window
  const AnchorElement = globalThis.HTMLAnchorElement
  if (!button?.click || !browserWindow || !AnchorElement) return null

  return new Promise((resolve) => {
    printablesProbeLock = printablesProbeLock.then(() => {
      return new Promise((innerResolve) => {
        const probeId = Math.random().toString(36).substring(7)
        button.setAttribute('data-printstream-probe-id', probeId)
        let timeout = 0

        const listener = (event) => {
          if (event.data?.type === 'printstream-probe-result' && event.data?.probeId === probeId) {
            clearTimeout(timeout)
            window.removeEventListener('message', listener)
            button.__printstreamProbedUrl = event.data.url
            innerResolve()
            resolve(event.data.url)
          }
        }
        window.addEventListener('message', listener)

        const script = document.createElement('script')
        script.src = chrome.runtime.getURL('printables-interceptor.js')
        script.dataset.probeId = probeId
        document.documentElement.appendChild(script)

        timeout = setTimeout(() => {
          window.removeEventListener('message', listener)
          button.__printstreamProbedUrl = null
          innerResolve()
          resolve(null)
        }, PRINTABLES_PROBE_TIMEOUT_MS)
        
        // Remove the script tag after a short delay so it has time to execute
        setTimeout(() => {
          if (script.parentNode) script.remove()
        }, 100)
      })
    }).catch(() => {
      button.__printstreamProbedUrl = null
      resolve(null)
    })
  })
}
