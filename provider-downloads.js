export const MAKERWORLD_REQUEST_HEADERS = {
  'X-BBL-Client-Type': 'web',
  'X-BBL-Client-Version': '00.00.00.01',
  'X-BBL-App-Source': 'makerworld',
  'X-BBL-Client-Name': 'MakerWorld',
  'Content-Type': 'application/json'
}

export async function resolveCandidateDownload(candidate, fetchImpl = fetch) {
  if (candidate?.provider === 'makerworld' && candidate.instanceId) {
    return await resolveMakerWorldDownload(candidate, fetchImpl)
  }

  return {
    sourceUrl: candidate?.sourceUrl ?? '',
    name: candidate?.name ?? null
  }
}

async function resolveMakerWorldDownload(candidate, fetchImpl) {
  const instanceId = encodeURIComponent(String(candidate.instanceId))
  const endpoint = new URL(`/api/v1/design-service/instance/${instanceId}/f3mf`, candidate.sourceUrl).toString()
  const response = await fetchImpl(endpoint, {
    credentials: 'include',
    headers: MAKERWORLD_REQUEST_HEADERS
  })
  if (!response.ok) {
    let errorMsg = `MakerWorld profile download responded ${response.status}.`
    try {
      const errBody = await response.json()
      if (errBody?.error || errBody?.message) {
        errorMsg = errBody.error || errBody.message
      }
    } catch {
      // Ignore json parsing errors
    }
    throw new Error(formatMakerWorldDownloadError(response.status, errorMsg))
  }

  const body = await response.json()
  if (typeof body?.url !== 'string' || body.url.length === 0) {
    throw new Error('MakerWorld did not return a downloadable profile URL.')
  }

  return {
    sourceUrl: body.url,
    name: typeof body?.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : null
  }
}

function formatMakerWorldDownloadError(status, message) {
  const normalized = String(message ?? '').trim() || `MakerWorld profile download responded ${status}.`
  if (status === 418 || /captcha|robot/i.test(normalized)) {
    return `MakerWorld blocked the download with a Captcha challenge: "${normalized}".`
  }
  return normalized
}
