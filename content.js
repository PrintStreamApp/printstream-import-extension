/* global chrome, document, MutationObserver, window */
const BUTTON_ID = 'printstream-remote-import-button'
const INJECTION_DEBOUNCE_MS = 250
let lastScheduledPageUrl = window.location.href
let injectionLoopStopped = false

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'printstream-trigger-import') {
    const btn = document.getElementById(BUTTON_ID)
    if (btn) {
      btn.click()
      sendResponse({ ok: true })
      return true
    }
  }
})

window.addEventListener('printstream:remote-import-helper-probe', (event) => {
  const probeId = event instanceof CustomEvent ? event.detail?.probeId : null
  if (!probeId) return
  window.postMessage({
    type: 'printstream-remote-import-helper-presence',
    probeId
  }, window.location.origin)
})

const SUPPORTED_PATTERNS = [
  /makerworld\.com$/i,
  /printables\.com$/i
]

if (shouldInject()) {
  startInjectionLoop()
}

function shouldInject() {
  return SUPPORTED_PATTERNS.some((pattern) => pattern.test(window.location.hostname))
}

function startInjectionLoop() {
  let debounceTimer = 0
  const scheduleInject = () => {
    if (injectionLoopStopped) return
    const currentPageUrl = window.location.href
    const existingButton = document.getElementById(BUTTON_ID)
    if (existingButton && currentPageUrl !== lastScheduledPageUrl) {
      existingButton.disabled = true
      existingButton.onclick = null
      existingButton.title = 'Loading current model details...'
      existingButton.dataset.printstreamReady = 'false'
      existingButton.dataset.printstreamPageUrl = currentPageUrl
    }
    lastScheduledPageUrl = currentPageUrl
    window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      void injectActions()
    }, INJECTION_DEBOUNCE_MS)
  }

  void injectActions()
  const observer = new MutationObserver(scheduleInject)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  const originalPushState = window.history.pushState
  const originalReplaceState = window.history.replaceState
  window.history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args)
    scheduleInject()
    return result
  }
  window.history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args)
    scheduleInject()
    return result
  }
  window.addEventListener('popstate', scheduleInject)
}

async function injectActions() {
  if (!document.body) return
  const pageUrl = window.location.href
  let extractProviderCandidates
  let extractPrintablesCandidatesFromDocument
  let fetchMakerWorldCandidates
  let probePrintablesDownloadUrl
  let extractPrintablesFileThumbnail
  let buildCandidate
  let buildImportPageUrl
  let resolveMakerWorldImportButtonState
  let createImportClickHandler
  let createInjectionBinding
  let isBindingCurrent
  let createPageBinding
  let matchesPageBinding
  let markButtonPending
  let markButtonReady
  let isExtensionContextInvalidatedError
  let resetPrintablesDownloadModalCounter
  let dismissPrintablesDownloadModal
  try {
    ;({ extractProviderCandidates, extractPrintablesCandidatesFromDocument, probePrintablesDownloadUrl, extractPrintablesFileThumbnail, fetchMakerWorldCandidates, buildCandidate } = await import(chrome.runtime.getURL('provider-candidates.js')))
    ;({ buildImportPageUrl } = await import(chrome.runtime.getURL('handoff.js')))
    ;({ resolveMakerWorldImportButtonState } = await import(chrome.runtime.getURL('makerworld-page.js')))
    ;({ createImportClickHandler } = await import(chrome.runtime.getURL('content-click.js')))
    ;({ createInjectionBinding, isBindingCurrent, markButtonPending, markButtonReady } = await import(chrome.runtime.getURL('content-state.js')))
    ;({ createPageBinding, matchesPageBinding } = await import(chrome.runtime.getURL('page-binding.js')))
    ;({ isExtensionContextInvalidatedError } = await import(chrome.runtime.getURL('extension-context.js')))
    ;({ resetPrintablesDownloadModalCounter } = await import(chrome.runtime.getURL('printables-download-guard.js')))
    ;({ dismissPrintablesDownloadModal } = await import(chrome.runtime.getURL('printables-modal.js')))
  } catch (error) {
    if (isExtensionContextInvalidatedError?.(error) ?? false) {
      stopInjectionLoopForInvalidatedContext()
      return
    }
    console.warn('PrintStream remote import helper could not load extension modules.', error)
    return
  }
  const provider = detectProvider(window.location.hostname)
  // ponytail: optional locale prefix (/en/model/...), covers /model/123/files too
  if (provider === 'printables' && !/^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/model\//i.test(window.location.pathname)) {
    removeFloatingButton()
    return
  }
  const binding = createInjectionBinding(createPageBinding(provider, pageUrl))
  if (provider === 'makerworld') {
    const state = resolveMakerWorldImportButtonState(document, pageUrl)
    if (!state.showButton) {
      removeFloatingButton()
      return
    }

    const button = ensureFloatingButton()
    markButtonPending(button, pageUrl)
    applyFloatingButtonState(button, state)
    if (state.disabled) {
      button.onclick = null
      markButtonReady(button, pageUrl)
      return
    }
  }

  const button = ensureFloatingButton()
  markButtonPending(button, pageUrl)
  if (provider !== 'makerworld') {
    applyFloatingButtonState(button, {
      disabled: false,
      label: 'Import to PrintStream',
      title: ''
    })
  }

  button.onclick = createImportClickHandler({
    binding,
    bindingProvider: provider,
    pageUrl,
    initialProvider: provider,
    button,
    buildImportPageUrl,
    buildCandidate,
    probePrintablesDownloadUrl,
    isBindingCurrent: (candidateBinding, bindingProvider, currentPageUrl) =>
      isBindingCurrent(matchesPageBinding, candidateBinding, bindingProvider, currentPageUrl),
    getCurrentPageUrl: () => window.location.href,
    detectProvider: () => detectProvider(window.location.hostname),
    extractCandidates: () => extractCandidatesSafely(extractProviderCandidates, extractPrintablesCandidatesFromDocument, provider, pageUrl, fetchMakerWorldCandidates),
    handlePrintablesAutoProbe: (initialCandidates, buttonElement, probeUrlFn, buildCandidateFn) =>
      handlePrintablesAutoProbe(
        initialCandidates,
        buttonElement,
        probeUrlFn,
        buildCandidateFn,
        dismissPrintablesDownloadModal,
        resetPrintablesDownloadModalCounter,
        extractPrintablesFileThumbnail,
        pageUrl
      ),
    uploadOrOpenImport
  })

  const candidates = await extractCandidatesSafely(extractProviderCandidates, extractPrintablesCandidatesFromDocument, provider, pageUrl, fetchMakerWorldCandidates)
  if (!isBindingCurrent(matchesPageBinding, binding, provider, window.location.href)) return

  button.textContent = candidates[0]?.printableStatus === 'printer-ready' ? 'Print to PrintStream' : 'Import to PrintStream'
  button.title = ''
  markButtonReady(button, pageUrl)

}
function stopInjectionLoopForInvalidatedContext() {
  injectionLoopStopped = true
  removeFloatingButton()
}

function ensureFloatingButton() {
  const existing = document.getElementById(BUTTON_ID)
  if (existing) return existing

  const button = document.createElement('button')
  button.id = BUTTON_ID
  button.type = 'button'
  button.textContent = 'Import to PrintStream'
  Object.assign(button.style, {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    zIndex: '2147483647',
    padding: '10px 14px',
    border: '2px solid #ffffff',
    borderRadius: '8px',
    background: '#1cab84',
    color: '#ffffff',
    font: '600 14px system-ui, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
  })
  document.body.appendChild(button)
  return button
}

function removeFloatingButton() {
  document.getElementById(BUTTON_ID)?.remove()
}

function applyFloatingButtonState(button, state) {
  button.disabled = Boolean(state.disabled)
  button.textContent = state.label
  button.title = state.title
  button.setAttribute('aria-disabled', state.disabled ? 'true' : 'false')
  Object.assign(button.style, {
    background: state.disabled ? '#7a7a7a' : '#1cab84',
    borderColor: state.disabled ? '#d0d0d0' : '#ffffff',
    cursor: state.disabled ? 'not-allowed' : 'pointer',
    opacity: state.disabled ? '0.78' : '1'
  })
}

async function extractCandidatesSafely(extractProviderCandidates, extractPrintablesCandidatesFromDocument, provider, pageUrl, fetchMakerWorldCandidates) {
  try {
    const html = document.documentElement.outerHTML
    const htmlCandidates = extractProviderCandidates({ provider, pageUrl, html })
    if (provider === 'makerworld' && typeof fetchMakerWorldCandidates === 'function') {
      // Scraping only ever finds the profile named in the URL hash, so the design service
      // is what turns a multi-profile model into more than one candidate.
      const apiCandidates = await fetchMakerWorldCandidates({ pageUrl, html })
      return apiCandidates.length > htmlCandidates.length ? apiCandidates : htmlCandidates
    }
    if (provider !== 'printables' || typeof extractPrintablesCandidatesFromDocument !== 'function') {
      return htmlCandidates
    }

    const domCandidates = await extractPrintablesCandidatesFromDocument(document, pageUrl)
    return mergeCandidates(domCandidates, htmlCandidates)
  } catch (error) {
    console.warn('PrintStream remote import candidate extraction failed.', error)
    return []
  }
}

function mergeCandidates(primary, secondary) {
  const seen = new Set()
  const merged = []
  for (const candidate of [...primary, ...secondary]) {
    if (!candidate?.sourceUrl || seen.has(candidate.sourceUrl)) continue
    seen.add(candidate.sourceUrl)
    merged.push(candidate)
  }
  return merged
}


async function uploadOrOpenImport({ candidate, candidates, buildImportPageUrl, pageUrl }) {
  const {
    printStreamBaseUrl = 'http://localhost:5173',
    printStreamTenantSlug = 'default'
  } = await chrome.storage.sync.get(['printStreamBaseUrl', 'printStreamTenantSlug'])

  let pageUrlToPass = pageUrl
  const provider = detectProvider(window.location.hostname)
  if (provider === 'printables' && !/\/(?:files|comments|makes|remixes)(?:\/|$)/.test(pageUrlToPass)) {
    const match = pageUrlToPass.match(/(https:\/\/(?:www\.)?printables\.com\/model\/\d+[^/#?]*)/i)
    if (match) pageUrlToPass = match[1] + '/files'
  }

  if (!candidate) {
    window.open(buildImportPageUrl(printStreamBaseUrl, printStreamTenantSlug, pageUrlToPass, candidates), '_blank', 'noopener,noreferrer')
    return
  }

  const response = await chrome.runtime.sendMessage({
    type: 'printstream-upload-candidate',
    pageUrl: pageUrlToPass,
    candidate,
    candidates
  })
  window.open(
    response?.ok && response.resultUrl
      ? response.resultUrl
      : response?.fallbackUrl ?? buildImportPageUrl(printStreamBaseUrl, printStreamTenantSlug, pageUrlToPass, candidates, candidate.sourceUrl),
    '_blank',
    'noopener,noreferrer'
  )
}

function detectProvider(hostname) {
  const host = hostname.toLowerCase()
  if (host === 'printables.com' || host.endsWith('.printables.com')) return 'printables'
  if (host === 'makerworld.com' || host.endsWith('.makerworld.com')) return 'makerworld'
  return 'generic'
}


async function handlePrintablesAutoProbe(
  initialCandidates,
  buttonElement,
  probeUrlFn,
  buildCandidateFn,
  dismissModalFn = () => false,
  resetModalCounterFn = () => {},
  fileThumbnailFn = () => null,
  boundPageUrl = window.location.href
) {
  // Model id from the page we were bound to at click time, not from whatever the SPA
  // has left in the DOM: stale download-file rows from the previous model still match
  // the selector, and probing them hands PrintStream the wrong files.
  const boundModelId = /\/model\/(\d+)/i.exec(boundPageUrl)?.[1] ?? null
  const onBoundModelFiles = () => {
    const path = window.location.pathname
    if (!/\/files(?:\/|$)/.test(path)) return false
    return boundModelId == null || new RegExp(`/model/${boundModelId}(?![0-9])`).test(path)
  }

  let finalCandidates = initialCandidates
  if (!onBoundModelFiles()) {
    buttonElement.textContent = 'Opening files...'
    buttonElement.disabled = true
    
    const filesTab = document.querySelector('a[data-testid="model-tab-files"]')
    if (filesTab) {
      filesTab.click()
      await new Promise((resolve) => setTimeout(resolve, 250))
      dismissModalFn(document)
      await new Promise((resolve) => {
         const check = () => {
           dismissModalFn(document)
           return onBoundModelFiles() && document.querySelectorAll('[data-testid="download-file"]').length > 0
         }
         if (check()) return resolve()
         const observer = new MutationObserver(() => {
            if (check()) {
               observer.disconnect()
               resolve()
            }
         })
         observer.observe(document.body, { childList: true, subtree: true })
         setTimeout(() => { observer.disconnect(); resolve() }, 5000)
      })
    } else {
       const match = boundPageUrl.match(/(https:\/\/(?:www\.)?printables\.com\/model\/\d+[^/#?]*)/i)
       if (match) {
         window.location.assign(match[1] + '/files')
         return null
       }
    }
  }

  dismissModalFn(document)
  if (!onBoundModelFiles()) return initialCandidates
  const fileButtons = Array.from(document.querySelectorAll('[data-testid="download-file"]'))
  if (fileButtons.length > 0) {
    buttonElement.textContent = 'Scanning downloads...'
    buttonElement.disabled = true
    
    finalCandidates = []
    const pageThumbnailUrl = document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null
    for (const btn of fileButtons) {
      resetModalCounterFn(window.localStorage)
      const sourceUrl = await probeUrlFn(btn)
      if (sourceUrl) {
         let current = btn
         for (let i = 0; i < 3; i++) {
           if (current.parentNode) current = current.parentNode
         }
         const lines = current.innerText?.trim().split('\n') || []
         const name = lines[0] ? `${lines[0]}.${lines[1]?.toLowerCase() || 'stl'}` : 'unknown-file.stl'
         const row = btn.closest?.('.download-item') ?? current
         finalCandidates.push(buildCandidateFn({
           provider: 'printables',
           sourceUrl,
           name,
           thumbnailUrl: fileThumbnailFn(row) ?? pageThumbnailUrl
         }))
      }
    }
  }
  return finalCandidates
}
