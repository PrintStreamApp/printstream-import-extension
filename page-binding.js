export function createPageBinding(provider, pageUrl) {
  return {
    provider,
    key: toPageBindingKey(provider, pageUrl)
  }
}

export function matchesPageBinding(binding, provider, currentPageUrl) {
  return binding?.provider === provider && binding?.key === toPageBindingKey(provider, currentPageUrl)
}

function toPageBindingKey(provider, pageUrl) {
  if (provider === 'printables') {
    return normalizePrintablesModelUrl(pageUrl)
  }
  return pageUrl
}

export function normalizePrintablesModelUrl(pageUrl) {
  try {
    const parsed = new URL(pageUrl)
    const match = parsed.pathname.match(/^\/model\/\d+[^/?#]*/i)
    return match ? `${parsed.origin}${match[0]}` : parsed.toString()
  } catch {
    return pageUrl
  }
}
