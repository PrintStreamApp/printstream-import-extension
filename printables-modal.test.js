import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dismissPrintablesDownloadModal } from './printables-modal.js'

test('dismissPrintablesDownloadModal closes the Printables while-it-is-downloading dialog', () => {
  let clicked = 0
  const closeButton = {
    className: 'btn btn-close svelte-hh9err',
    click() {
      clicked += 1
    }
  }
  const modalContent = {
    querySelector(selector) {
      assert.equal(selector, 'button.btn-close')
      return closeButton
    }
  }
  const dialog = {
    querySelector(selector) {
      assert.equal(selector, '.modal-content')
      return modalContent
    },
    textContent: 'While it’s downloading… Sign up for free Prusa Account to get'
  }
  const document = {
    querySelectorAll(selector) {
      assert.equal(selector, '[role="dialog"][aria-modal="true"]')
      return [dialog]
    }
  }

  const dismissed = dismissPrintablesDownloadModal(document)

  assert.equal(dismissed, true)
  assert.equal(clicked, 1)
})

test('dismissPrintablesDownloadModal ignores unrelated dialogs', () => {
  const document = {
    querySelectorAll() {
      return [{
        querySelector() {
          return null
        },
        textContent: 'Completely unrelated dialog'
      }]
    }
  }

  assert.equal(dismissPrintablesDownloadModal(document), false)
})
