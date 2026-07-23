import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createInjectionBinding, isBindingCurrent, markButtonPending, markButtonReady } from './content-state.js'

test('isBindingCurrent only accepts the latest run for the same page URL', () => {
  const binding = createInjectionBinding({ provider: 'makerworld', key: 'https://makerworld.com/en/models/1-a' })
  const matcher = (candidate, provider, currentPageUrl) => candidate.provider === provider && candidate.key === currentPageUrl

  assert.equal(isBindingCurrent(matcher, binding, 'makerworld', 'https://makerworld.com/en/models/1-a'), true)
  assert.equal(isBindingCurrent(matcher, binding, 'makerworld', 'https://makerworld.com/en/models/2-b'), false)
})

test('markButtonPending invalidates the previous page binding and click handler', () => {
  const button = {
    disabled: false,
    textContent: '',
    title: '',
    onclick: () => {},
    dataset: {}
  }

  markButtonPending(button, 'https://makerworld.com/en/models/2-b')

  assert.equal(button.disabled, true)
  assert.equal(button.title, 'Loading current model details...')
  assert.equal(button.onclick, null)
  assert.equal(button.dataset.printstreamPageUrl, 'https://makerworld.com/en/models/2-b')
  assert.equal(button.dataset.printstreamReady, 'false')
})

test('markButtonReady marks the current page as safe to use', () => {
  const button = { disabled: true, title: 'Loading current model details...', dataset: {} }

  markButtonReady(button, 'https://makerworld.com/en/models/2-b')

  assert.equal(button.disabled, false)
  assert.equal(button.title, '')
  assert.equal(button.dataset.printstreamPageUrl, 'https://makerworld.com/en/models/2-b')
  assert.equal(button.dataset.printstreamReady, 'true')
})
