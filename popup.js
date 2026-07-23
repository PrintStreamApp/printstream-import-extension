/* global chrome, document, window */
const openImportButton = document.getElementById('open-import')
const status = document.getElementById('status')
let extensionState = { status: 'unknown' }
let extensionStatePromise = refreshExtensionState()

void extensionStatePromise

openImportButton.addEventListener('click', async () => {
  await extensionStatePromise

  if (extensionState.status === 'login-required') {
    await chrome.tabs.create({ url: extensionState.baseUrl })
    window.close()
    return
  }

  if (extensionState.status === 'no-workspace') {
    await chrome.runtime.openOptionsPage()
    window.close()
    return
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) {
    status.textContent = 'No active tab URL is available.'
    return
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'printstream-trigger-import' })
    if (response?.ok) {
      window.close()
      return
    }
  } catch {
    // Content script not loaded or didn't respond
  }

  const {
    printStreamBaseUrl = 'http://localhost:5173',
    printStreamTenantSlug = 'default'
  } = await chrome.storage.sync.get(['printStreamBaseUrl', 'printStreamTenantSlug'])
  const target = new URL(`${printStreamBaseUrl.replace(/\/+$/, '')}/workspaces/${normalizeTenantSlug(printStreamTenantSlug)}/import`)
  target.searchParams.set('url', tab.url)
  await chrome.tabs.create({ url: target.toString() })
})

async function refreshExtensionState() {
  const {
    printStreamBaseUrl = 'http://localhost:5173',
    printStreamTenantSlug = 'default'
  } = await chrome.storage.sync.get(['printStreamBaseUrl', 'printStreamTenantSlug'])
  const baseUrl = printStreamBaseUrl.replace(/\/+$/, '')
  extensionState = { status: 'unknown', baseUrl, tenantSlug: normalizeTenantSlug(printStreamTenantSlug) }

  try {
    const response = await fetch(`${baseUrl}/api/plugins/remote-imports/extension-context`, {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) return
    const context = await response.json()

    if ((context.authEnabled && !context.authenticated) || context.setupRequired) {
      extensionState = { status: 'login-required', baseUrl }
      openImportButton.textContent = 'Login to PrintStream first'
      status.textContent = 'Configure the PrintStream URL in options, then login before importing.'
      return
    }

    const workspaces = Array.isArray(context.workspaces) ? context.workspaces : []
    const importReadyWorkspaces = workspaces.filter((workspace) => Number(workspace?.bridgeCount ?? 0) > 0)
    if (importReadyWorkspaces.length === 0) {
      extensionState = { status: 'no-workspace', baseUrl }
      openImportButton.textContent = 'Open options'
      status.textContent = workspaces.length > 0
        ? 'You have workspace access, but none of those workspaces has a connected bridge yet.'
        : 'No workspace is available with library upload access and a connected bridge.'
      return
    }

    const selected = importReadyWorkspaces.find((workspace) => workspace?.tenant?.slug === normalizeTenantSlug(printStreamTenantSlug)) ?? importReadyWorkspaces[0]
    if (selected?.tenant?.slug && selected.tenant.slug !== printStreamTenantSlug) {
      await chrome.storage.sync.set({ printStreamTenantSlug: selected.tenant.slug })
    }
    extensionState = { status: 'ready', baseUrl, tenantSlug: selected?.tenant?.slug ?? normalizeTenantSlug(printStreamTenantSlug) }
  } catch {
    status.textContent = 'PrintStream could not be reached. Check options if imports fail.'
  }
}

function normalizeTenantSlug(tenantSlug) {
  const normalized = String(tenantSlug ?? '').trim().toLowerCase()
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : 'default'
}
