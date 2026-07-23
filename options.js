/* global chrome, document */
const baseUrlInput = document.getElementById('base-url')
const tenantSelect = document.getElementById('tenant-select')
const importUrlPreview = document.getElementById('import-url-preview')
const saveButton = document.getElementById('save')
const refreshWorkspacesButton = document.getElementById('refresh-workspaces')
const openSignInButton = document.getElementById('open-sign-in')
const status = document.getElementById('status')

void load()

baseUrlInput.addEventListener('input', () => {
  updateControlState()
  updatePreview()
})
tenantSelect.addEventListener('change', () => {
  if (tenantSelect.value) {
    tenantSelect.dataset.savedTenantSlug = tenantSelect.value
    void chrome.storage.sync.set({ printStreamTenantSlug: tenantSelect.value })
    updatePreview()
  }
})

saveButton.addEventListener('click', async () => {
  const baseUrl = baseUrlInput.value.trim() || 'http://localhost:5173'
  await chrome.storage.sync.set({
    printStreamBaseUrl: baseUrl
  })
  updateControlState()
  updatePreview()

  const originPattern = toOriginPattern(baseUrl)
  if (!originPattern) {
    status.textContent = 'Saved. The URL is invalid, so upload permission was not requested.'
    setTenantOptions([])
    return
  }

  const granted = await chrome.permissions.request({ origins: [originPattern] })
  if (!granted) {
    status.textContent = 'Saved. Permission was not granted, so the helper will open PrintStream for manual handoff.'
    return
  }

  await refreshWorkspaces()
})

refreshWorkspacesButton.addEventListener('click', async () => {
  await saveBaseUrlPermissionAndRefresh()
})

openSignInButton.addEventListener('click', async () => {
  const baseUrl = baseUrlInput.value.trim() || 'http://localhost:5173'
  await chrome.tabs.create({ url: baseUrl.replace(/\/+$/, '') })
})

async function load() {
  const {
    printStreamBaseUrl = 'http://localhost:5173',
    printStreamTenantSlug = 'default'
  } = await chrome.storage.sync.get(['printStreamBaseUrl', 'printStreamTenantSlug'])
  baseUrlInput.value = printStreamBaseUrl
  tenantSelect.dataset.savedTenantSlug = normalizeTenantSlug(printStreamTenantSlug)
  updateControlState()
  updatePreview()
  await refreshWorkspaces({ quiet: true })
}

function updatePreview() {
  const baseUrl = baseUrlInput.value.trim()
  const originPattern = toOriginPattern(baseUrl)
  if (!originPattern) {
    importUrlPreview.textContent = 'Enter a valid PrintStream URL to load workspaces'
    return
  }

  if (!tenantSelect.value) {
    importUrlPreview.textContent = 'Find workspaces to choose the import target'
    return
  }

  const tenantSlug = normalizeTenantSlug(tenantSelect.value)
  importUrlPreview.textContent = `${baseUrl.replace(/\/+$/, '')}/workspaces/${tenantSlug}/import`
}

async function saveBaseUrlPermissionAndRefresh() {
  const baseUrl = baseUrlInput.value.trim() || 'http://localhost:5173'
  await chrome.storage.sync.set({ printStreamBaseUrl: baseUrl })
  const originPattern = toOriginPattern(baseUrl)
  if (!originPattern) {
    status.textContent = 'The PrintStream URL is invalid.'
    return
  }
  const granted = await chrome.permissions.request({ origins: [originPattern] })
  if (!granted) {
    status.textContent = 'Permission was not granted, so workspaces cannot be discovered.'
    return
  }
  await refreshWorkspaces()
}

async function refreshWorkspaces(options = {}) {
  const baseUrl = baseUrlInput.value.trim() || 'http://localhost:5173'
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/plugins/remote-imports/extension-context`
  const originPattern = toOriginPattern(baseUrl)
  openSignInButton.hidden = true

  if (!originPattern) {
    setTenantOptions([])
    updateControlState()
    if (!options.quiet) status.textContent = 'Enter a valid PrintStream URL first.'
    return
  }

  try {
    const response = await fetch(endpoint, {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) {
      setTenantOptions([])
      if (!options.quiet) status.textContent = `Could not load workspaces (${response.status}).`
      return
    }

    const context = await response.json()
    const workspaces = Array.isArray(context.workspaces) ? context.workspaces : []
    setTenantOptions(workspaces)
    const importReadyWorkspaces = workspaces.filter((workspace) => Number(workspace?.bridgeCount ?? 0) > 0)

    if (context.authEnabled && !context.authenticated) {
      status.textContent = 'Login to PrintStream first.'
      openSignInButton.hidden = false
      return
    }

    if (context.setupRequired) {
      status.textContent = 'Finish PrintStream auth setup first.'
      openSignInButton.hidden = false
      return
    }

    if (workspaces.length === 0) {
      status.textContent = context.authenticated || !context.authEnabled
        ? 'No workspace is available with library upload access and a connected bridge.'
        : 'Login to PrintStream first.'
      openSignInButton.hidden = Boolean(context.authenticated || !context.authEnabled)
      return
    }

    if (importReadyWorkspaces.length === 0) {
      status.textContent = 'You have workspace access, but none of those workspaces has a connected bridge yet.'
      updatePreview()
      return
    }

    const selectedSlug = normalizeTenantSlug(tenantSelect.dataset.savedTenantSlug)
    const selected = importReadyWorkspaces.find((workspace) => workspace?.tenant?.slug === selectedSlug) ?? importReadyWorkspaces[0]
    if (selected?.tenant?.slug) {
      tenantSelect.value = selected.tenant.slug
      tenantSelect.dataset.savedTenantSlug = selected.tenant.slug
      await chrome.storage.sync.set({ printStreamTenantSlug: selected.tenant.slug })
      updatePreview()
    }

    const disabledCount = workspaces.length - importReadyWorkspaces.length
    status.textContent = disabledCount > 0
      ? `Ready for ${importReadyWorkspaces.length} workspace${importReadyWorkspaces.length === 1 ? '' : 's'}. ${disabledCount} workspace${disabledCount === 1 ? ' is' : 's are'} unavailable because no bridge is connected.`
      : `Ready for ${importReadyWorkspaces.length} workspace${importReadyWorkspaces.length === 1 ? '' : 's'}.`
  } catch {
    setTenantOptions([])
    if (!options.quiet) status.textContent = 'Could not reach PrintStream. Check the base URL.'
  }
}

function setTenantOptions(workspaces) {
  const currentSlug = normalizeTenantSlug(tenantSelect.dataset.savedTenantSlug)
  tenantSelect.replaceChildren()
  tenantSelect.disabled = workspaces.length === 0

  if (workspaces.length === 0) {
    tenantSelect.append(optionElement('', 'No import-ready workspaces found'))
    return
  }

  for (const workspace of workspaces) {
    const tenant = workspace?.tenant
    if (!tenant?.slug) continue
    const bridgeCount = Number(workspace.bridgeCount ?? 0)
    const disabled = bridgeCount <= 0
    tenantSelect.append(optionElement(
      tenant.slug,
      disabled
        ? `${tenant.name || tenant.slug} (${tenant.slug}) - unavailable, no bridge connected`
        : `${tenant.name || tenant.slug} (${tenant.slug}) - ${bridgeCount} bridge${bridgeCount === 1 ? '' : 's'}`,
      disabled
    ))
  }

  if ([...tenantSelect.options].some((option) => option.value === currentSlug && !option.disabled)) {
    tenantSelect.value = currentSlug
  } else {
    const firstEnabledOption = [...tenantSelect.options].find((option) => !option.disabled)
    tenantSelect.value = firstEnabledOption?.value ?? ''
  }

  tenantSelect.disabled = [...tenantSelect.options].every((option) => option.disabled)
}

function updateControlState() {
  const hasValidOrigin = toOriginPattern(baseUrlInput.value.trim()) != null
  refreshWorkspacesButton.disabled = !hasValidOrigin
  if (!hasValidOrigin) {
    tenantSelect.disabled = true
    openSignInButton.hidden = true
  }
}

function optionElement(value, label, disabled = false) {
  const option = document.createElement('option')
  option.value = value
  option.textContent = label
  option.disabled = disabled
  return option
}

function toOriginPattern(value) {
  try {
    const parsed = new URL(value)
    return `${parsed.origin}/*`
  } catch {
    return null
  }
}

function normalizeTenantSlug(tenantSlug) {
  const normalized = String(tenantSlug ?? '').trim().toLowerCase()
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : 'default'
}
