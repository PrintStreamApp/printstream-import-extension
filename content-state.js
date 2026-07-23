const BUTTON_LOADING_LABEL = 'Import to PrintStream'

export function createInjectionBinding(binding) {
  return binding
}

export function isBindingCurrent(matcher, binding, provider, currentPageUrl) {
  return matcher(binding, provider, currentPageUrl)
}

export function markButtonPending(button, pageUrl) {
  if (!button) return
  button.disabled = true
  button.textContent = BUTTON_LOADING_LABEL
  button.title = 'Loading current model details...'
  button.onclick = null
  button.dataset.printstreamPageUrl = pageUrl
  button.dataset.printstreamReady = 'false'
}

export function markButtonReady(button, pageUrl) {
  if (!button) return
  button.disabled = false
  button.title = ''
  button.dataset.printstreamPageUrl = pageUrl
  button.dataset.printstreamReady = 'true'
}
