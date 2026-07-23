export function resetPrintablesDownloadModalCounter(localStorage = globalThis.localStorage) {
  if (!localStorage?.setItem) return
  localStorage.setItem('showLoginModalForDownload', '0')
}
