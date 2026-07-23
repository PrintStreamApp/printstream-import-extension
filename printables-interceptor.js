/* global document, HTMLAnchorElement, window */
(function() {
  const scripts = document.querySelectorAll('script[src*="printables-interceptor.js"]')
  const currentScript = scripts[scripts.length - 1]
  const probeId = currentScript?.dataset?.probeId

  if (!probeId) return

  const btn = document.querySelector(`[data-printstream-probe-id="${probeId}"]`)
  if (!btn) {
    window.postMessage({ type: 'printstream-probe-result', probeId, url: null }, '*')
    return
  }

  const origClick = HTMLAnchorElement.prototype.click
  const origOpen = window.open
  let timeoutId

  const cleanup = () => {
    clearTimeout(timeoutId)
    HTMLAnchorElement.prototype.click = origClick
    window.open = origOpen
  }

  HTMLAnchorElement.prototype.click = function() {
    const href = this.href || this.getAttribute?.('href')
    if (href && href.includes('files.printables.com')) {
      cleanup()
      window.postMessage({ type: 'printstream-probe-result', probeId, url: href }, '*')
    } else {
      origClick.call(this)
    }
  }

  window.open = function(url, ...args) {
    if (typeof url === 'string' && url.includes('files.printables.com')) {
      cleanup()
      window.postMessage({ type: 'printstream-probe-result', probeId, url }, '*')
      return null
    }
    return origOpen.call(this, url, ...args)
  }

  timeoutId = setTimeout(() => {
    cleanup()
    window.postMessage({ type: 'printstream-probe-result', probeId, url: null }, '*')
  }, 3000)

  try {
    btn.click()
  } catch {
    cleanup()
    window.postMessage({ type: 'printstream-probe-result', probeId, url: null }, '*')
  }
})()
