export function createImportClickHandler({
  binding,
  bindingProvider,
  pageUrl,
  button,
  buildImportPageUrl,
  buildCandidate,
  probePrintablesDownloadUrl,
  isBindingCurrent,
  getCurrentPageUrl,
  detectProvider,
  extractCandidates,
  handlePrintablesAutoProbe,
  uploadOrOpenImport
}) {
  return async function onImportClick() {
    if (button?.dataset?.printstreamBusy === 'true') return
    if (!isBindingCurrent(binding, bindingProvider, getCurrentPageUrl())) return
    const idleLabel = button.textContent || 'Import to PrintStream'
    setButtonBusyState(button, 'Preparing import...')

    try {
      let candidates = await extractCandidates()
      if (!isBindingCurrent(binding, bindingProvider, getCurrentPageUrl())) return

      const currentProvider = detectProvider()
      if (currentProvider === 'printables' && candidates.length === 0) {
        const result = await handlePrintablesAutoProbe(candidates, button, probePrintablesDownloadUrl, buildCandidate)
        if (result) candidates = result
      }
      if (!isBindingCurrent(binding, bindingProvider, getCurrentPageUrl())) return

      setButtonBusyState(button, 'Opening PrintStream...')
      await uploadOrOpenImport({
        candidate: candidates[0] ?? null,
        candidates,
        buildImportPageUrl,
        pageUrl
      })
    } finally {
      restoreButtonState(button, idleLabel)
    }
  }
}

function setButtonBusyState(button, label) {
  if (!button) return
  button.dataset.printstreamBusy = 'true'
  button.disabled = true
  button.textContent = label
}

function restoreButtonState(button, idleLabel) {
  if (!button) return
  button.dataset.printstreamBusy = 'false'
  button.disabled = false
  button.textContent = idleLabel
}
