import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resetPrintablesDownloadModalCounter } from './printables-download-guard.js'

test('resetPrintablesDownloadModalCounter sets the Printables modal counter back to zero', () => {
  const calls = []
  const localStorage = {
    setItem(key, value) {
      calls.push([key, value])
    }
  }

  resetPrintablesDownloadModalCounter(localStorage)

  assert.deepEqual(calls, [['showLoginModalForDownload', '0']])
})

test('resetPrintablesDownloadModalCounter is a no-op when localStorage is unavailable', () => {
  assert.doesNotThrow(() => resetPrintablesDownloadModalCounter(null))
})
