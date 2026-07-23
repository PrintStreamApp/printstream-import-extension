/* global chrome */
import { buildImportPageUrl } from './handoff.js'
import { resolveCandidateDownload } from './provider-downloads.js'

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'printstream-upload-candidate') return false

    void buildCandidateImportResponse(message).then(sendResponse)
    return true
  })
}

if (globalThis.chrome?.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void chrome.runtime.openOptionsPage()
    }
  })
}

export async function buildCandidateImportResponse(message) {
  let {
    printStreamBaseUrl = 'http://localhost:5173',
    printStreamTenantSlug = 'default'
  } = await chrome.storage.sync.get(['printStreamBaseUrl', 'printStreamTenantSlug'])

  try {
    const readiness = await resolveExtensionReadiness(printStreamBaseUrl, printStreamTenantSlug)
    if (readiness.status === 'login-required') {
      return {
        ok: false,
        fallbackUrl: buildHubHomeUrl(printStreamBaseUrl),
        error: 'Login to PrintStream first.'
      }
    }
    if (readiness.status === 'no-workspace') {
      return {
        ok: false,
        fallbackUrl: chrome.runtime.getURL('options.html'),
        error: 'No workspace is available with library upload access and a connected bridge.'
      }
    }
    if (readiness.tenantSlug) {
      printStreamTenantSlug = readiness.tenantSlug
    }

    const resolvedCandidate = await resolveCandidateDownload(message.candidate)
    const resolvedCandidateRecord = {
      ...(message.candidate ?? {}),
      sourceUrl: resolvedCandidate.sourceUrl,
      name: resolvedCandidate.name || message.candidate?.name || fileNameFromUrl(resolvedCandidate.sourceUrl) || 'remote-import'
    }

    const candidates = Array.isArray(message.candidates) ? message.candidates : []
    const updatedCandidates = candidates.length > 0
      ? candidates.map(c => c.sourceUrl === message.candidate?.sourceUrl ? resolvedCandidateRecord : c)
      : [resolvedCandidateRecord]

    return {
      ok: true,
      resultUrl: buildImportPageUrl(
        printStreamBaseUrl,
        printStreamTenantSlug,
        message.pageUrl,
        updatedCandidates,
        resolvedCandidate.sourceUrl
      )
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Import handoff failed.'
    return {
      ok: false,
      fallbackUrl: buildImportPageUrl(
        printStreamBaseUrl,
        printStreamTenantSlug,
        message.pageUrl,
        Array.isArray(message.candidates) ? message.candidates : [],
        message.candidate?.sourceUrl ?? null,
        errorMsg
      ),
      error: errorMsg
    }
  }
}

async function resolveExtensionReadiness(baseUrl, tenantSlug) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/plugins/remote-imports/extension-context`, {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) return { status: 'unknown', tenantSlug }
    const context = await response.json()
    if ((context.authEnabled && !context.authenticated) || context.setupRequired) {
      return { status: 'login-required', tenantSlug: null }
    }

    const workspaces = Array.isArray(context.workspaces) ? context.workspaces : []
    if (workspaces.length === 0) return { status: 'no-workspace', tenantSlug: null }

    const importReadyWorkspaces = workspaces.filter((workspace) => Number(workspace?.bridgeCount ?? 0) > 0)
    if (importReadyWorkspaces.length === 0) return { status: 'no-workspace', tenantSlug: null }

    const normalizedTenantSlug = normalizeTenantSlug(tenantSlug)
    const selected = importReadyWorkspaces.find((workspace) => workspace?.tenant?.slug === normalizedTenantSlug) ?? importReadyWorkspaces[0]
    const selectedSlug = selected?.tenant?.slug ? normalizeTenantSlug(selected.tenant.slug) : normalizedTenantSlug
    if (selectedSlug !== normalizedTenantSlug) {
      await chrome.storage.sync.set({ printStreamTenantSlug: selectedSlug })
    }
    return { status: 'ready', tenantSlug: selectedSlug }
  } catch {
    return { status: 'unknown', tenantSlug }
  }
}

function fileNameFromUrl(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl)
    const last = parsed.pathname.split('/').filter(Boolean).at(-1)
    return last ? decodeURIComponent(last) : null
  } catch {
    return null
  }
}

function buildHubHomeUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '') || 'http://localhost:5173'
}

function normalizeTenantSlug(tenantSlug) {
  const normalized = String(tenantSlug ?? '').trim().toLowerCase()
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : 'default'
}
