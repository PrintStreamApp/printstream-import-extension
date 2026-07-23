import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createImportClickHandler } from './content-click.js'

test('createImportClickHandler uploads MakerWorld candidates without throwing', async () => {
  const calls = []
  const handler = createImportClickHandler({
    binding: { pageUrl: 'https://makerworld.com/en/models/2-b' },
    bindingProvider: 'makerworld',
    pageUrl: 'https://makerworld.com/en/models/2-b',
    initialProvider: 'makerworld',
    button: { textContent: '', disabled: false, dataset: {} },
    buildImportPageUrl: () => 'http://localhost:5173/workspaces/default/import',
    buildCandidate: () => null,
    probePrintablesDownloadUrl: async () => null,
    isBindingCurrent: () => true,
    getCurrentPageUrl: () => 'https://makerworld.com/en/models/2-b',
    detectProvider: () => 'makerworld',
    extractCandidates: async () => [{ sourceUrl: 'https://makerworld.com/en/models/2-b#profileId-2', name: 'Model B.3mf' }],
    handlePrintablesAutoProbe: async () => null,
    uploadOrOpenImport: async (payload) => {
      calls.push(payload)
    }
  })

  await assert.doesNotReject(handler)
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.candidate?.name, 'Model B.3mf')
  assert.equal(calls[0]?.pageUrl, 'https://makerworld.com/en/models/2-b')
})

test('createImportClickHandler only auto-probes Printables pages', async () => {
  let autoProbeCalls = 0
  const handler = createImportClickHandler({
    binding: { pageUrl: 'https://makerworld.com/en/models/2-b' },
    bindingProvider: 'makerworld',
    pageUrl: 'https://makerworld.com/en/models/2-b',
    initialProvider: 'makerworld',
    button: { textContent: '', disabled: false, dataset: {} },
    buildImportPageUrl: () => 'http://localhost:5173/workspaces/default/import',
    buildCandidate: () => null,
    probePrintablesDownloadUrl: async () => null,
    isBindingCurrent: () => true,
    getCurrentPageUrl: () => 'https://makerworld.com/en/models/2-b',
    detectProvider: () => 'makerworld',
    extractCandidates: async () => [],
    handlePrintablesAutoProbe: async () => {
      autoProbeCalls += 1
      return null
    },
    uploadOrOpenImport: async () => {}
  })

  await handler()
  assert.equal(autoProbeCalls, 0)
})

test('createImportClickHandler disables the button while work is in progress and restores it after upload', async () => {
  let resolveUpload
  const uploadPromise = new Promise((resolve) => {
    resolveUpload = resolve
  })
  const button = { textContent: 'Import to PrintStream', disabled: false, dataset: {} }
  const handler = createImportClickHandler({
    binding: { pageUrl: 'https://makerworld.com/en/models/2-b' },
    bindingProvider: 'makerworld',
    pageUrl: 'https://makerworld.com/en/models/2-b',
    initialProvider: 'makerworld',
    button,
    buildImportPageUrl: () => 'http://localhost:5173/workspaces/default/import',
    buildCandidate: () => null,
    probePrintablesDownloadUrl: async () => null,
    isBindingCurrent: () => true,
    getCurrentPageUrl: () => 'https://makerworld.com/en/models/2-b',
    detectProvider: () => 'makerworld',
    extractCandidates: async () => [{ sourceUrl: 'https://makerworld.com/en/models/2-b#profileId-2', name: 'Model B.3mf' }],
    handlePrintablesAutoProbe: async () => null,
    uploadOrOpenImport: async () => {
      await uploadPromise
    }
  })

  const pending = handler()
  assert.equal(button.disabled, true)
  assert.equal(button.textContent, 'Preparing import...')
  assert.equal(button.dataset.printstreamBusy, 'true')

  await Promise.resolve()
  assert.equal(button.textContent, 'Opening PrintStream...')

  resolveUpload()
  await pending
  assert.equal(button.disabled, false)
  assert.equal(button.textContent, 'Import to PrintStream')
  assert.equal(button.dataset.printstreamBusy, 'false')
})

test('createImportClickHandler ignores repeated clicks while a probe is already running', async () => {
  let resolveUpload
  let uploadCalls = 0
  const uploadPromise = new Promise((resolve) => {
    resolveUpload = resolve
  })
  const button = { textContent: 'Import to PrintStream', disabled: false, dataset: {} }
  const handler = createImportClickHandler({
    binding: { pageUrl: 'https://www.printables.com/model/123-widget' },
    bindingProvider: 'printables',
    pageUrl: 'https://www.printables.com/model/123-widget',
    initialProvider: 'printables',
    button,
    buildImportPageUrl: () => 'http://localhost:5173/workspaces/default/import',
    buildCandidate: () => null,
    probePrintablesDownloadUrl: async () => null,
    isBindingCurrent: () => true,
    getCurrentPageUrl: () => 'https://www.printables.com/model/123-widget',
    detectProvider: () => 'printables',
    extractCandidates: async () => [],
    handlePrintablesAutoProbe: async () => [{ sourceUrl: 'https://files.printables.com/widget.stl', name: 'widget.stl' }],
    uploadOrOpenImport: async () => {
      uploadCalls += 1
      await uploadPromise
    }
  })

  const firstClick = handler()
  const secondClick = handler()

  resolveUpload()
  await Promise.all([firstClick, secondClick])
  assert.equal(uploadCalls, 1)
})
