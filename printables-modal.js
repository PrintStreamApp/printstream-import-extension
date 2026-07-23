const PRINTABLES_MODAL_SELECTOR = '[role="dialog"][aria-modal="true"]'
const PRINTABLES_MODAL_HEADING = 'while it’s downloading…'
const PRINTABLES_MODAL_HEADING_FALLBACK = "while it's downloading"

export function dismissPrintablesDownloadModal(document) {
  const dialogs = document?.querySelectorAll?.(PRINTABLES_MODAL_SELECTOR) ?? []
  for (const dialog of dialogs) {
    const text = normalizeText(dialog?.textContent)
    if (!text.includes(PRINTABLES_MODAL_HEADING) && !text.includes(PRINTABLES_MODAL_HEADING_FALLBACK)) continue
    const modalContent = dialog.querySelector?.('.modal-content')
    const closeButton = modalContent?.querySelector?.('button.btn-close')
    if (!closeButton?.click) return false
    closeButton.click()
    return true
  }
  return false
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
