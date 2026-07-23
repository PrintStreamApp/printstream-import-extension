export function buildImportPageUrl(baseUrl, tenantSlug, pageUrl, candidates, selectedUrl = null, error = null) {
  const target = new URL(`${tenantImportBaseUrl(baseUrl, tenantSlug)}/import`)
  target.searchParams.set('url', pageUrl)
  if (selectedUrl) target.searchParams.set('candidate', selectedUrl)
  if (error) target.searchParams.set('error', error)
  if (candidates.length > 0) {
    target.searchParams.set('candidates', JSON.stringify(candidates.slice(0, 10)))
  }
  return target.toString()
}

export function buildImportResultUrl(baseUrl, tenantSlug, uploadResponse) {
  const target = new URL(`${tenantImportBaseUrl(baseUrl, tenantSlug)}/import`)
  target.searchParams.set('uploadedFileId', uploadResponse.file.id)
  target.searchParams.set('uploadedName', uploadResponse.file.name)
  target.searchParams.set('uploadedFile', JSON.stringify(uploadResponse.file))
  if (uploadResponse.canPrintDirectly) target.searchParams.set('print', '1')
  return target.toString()
}

export function resolveUploadBridgeId(browseResponse) {
  if (browseResponse?.activeBridgeId) return browseResponse.activeBridgeId
  const bridges = Array.isArray(browseResponse?.bridgeEntries) ? browseResponse.bridgeEntries : []
  if (bridges.length === 1 && typeof bridges[0]?.id === 'string') return bridges[0].id
  return null
}

export function normalizeTenantSlug(tenantSlug) {
  const normalized = String(tenantSlug ?? '').trim().toLowerCase()
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : 'default'
}

export function tenantImportBaseUrl(baseUrl, tenantSlug) {
  return `${trimBaseUrl(baseUrl)}/workspaces/${normalizeTenantSlug(tenantSlug)}`
}

function trimBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '')
}
