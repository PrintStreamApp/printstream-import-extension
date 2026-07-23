const MAKERWORLD_MODEL_PAGE_PATTERN = /^\/en\/models\/[^/?#]+/i
const MAKERWORLD_LOGIN_LABEL = 'log in'

export function isMakerWorldModelUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    const host = parsed.hostname.toLowerCase()
    return (host === 'makerworld.com' || host.endsWith('.makerworld.com'))
      && MAKERWORLD_MODEL_PAGE_PATTERN.test(parsed.pathname)
  } catch {
    return false
  }
}

export function resolveMakerWorldImportButtonState(document, pageUrl, getComputedStyleImpl = globalThis.getComputedStyle) {
  if (!isMakerWorldModelUrl(pageUrl)) {
    return {
      showButton: false,
      disabled: true,
      label: 'Import to PrintStream',
      title: ''
    }
  }

  if (hasVisibleMakerWorldLoginControl(document, getComputedStyleImpl)) {
    return {
      showButton: true,
      disabled: true,
      label: 'Import to PrintStream (log in required)',
      title: 'Log in to MakerWorld first, then try Import to PrintStream again.'
    }
  }

  return {
    showButton: true,
    disabled: false,
    label: 'Import to PrintStream',
    title: ''
  }
}

function hasVisibleMakerWorldLoginControl(document, getComputedStyleImpl) {
  const controls = document?.querySelectorAll?.('a, button, [role="button"]') ?? []
  for (const control of controls) {
    if (!isVisible(control, getComputedStyleImpl)) continue
    if (readControlText(control).includes(MAKERWORLD_LOGIN_LABEL)) return true
  }
  return false
}

function isVisible(control, getComputedStyleImpl) {
  if (!control || control.hidden || control.getAttribute?.('aria-hidden') === 'true') return false
  if (typeof getComputedStyleImpl !== 'function') return true
  const style = getComputedStyleImpl(control)
  return style?.display !== 'none' && style?.visibility !== 'hidden'
}

function readControlText(control) {
  return [
    control?.textContent,
    control?.getAttribute?.('aria-label'),
    control?.getAttribute?.('title')
  ]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
