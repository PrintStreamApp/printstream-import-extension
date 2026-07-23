import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isMakerWorldModelUrl, resolveMakerWorldImportButtonState } from './makerworld-page.js'

test('isMakerWorldModelUrl only accepts MakerWorld English model pages', () => {
  assert.equal(isMakerWorldModelUrl('https://makerworld.com/en/models/578636-the-best-sword-in-the-world'), true)
  assert.equal(isMakerWorldModelUrl('https://makerworld.com/en/collections/123-featured'), false)
  assert.equal(isMakerWorldModelUrl('https://example.com/en/models/578636-the-best-sword-in-the-world'), false)
})

test('resolveMakerWorldImportButtonState hides the button off model pages', () => {
  const state = resolveMakerWorldImportButtonState(createDocument([]), 'https://makerworld.com/en/explore')

  assert.deepEqual(state, {
    showButton: false,
    disabled: true,
    label: 'Import to PrintStream',
    title: ''
  })
})

test('resolveMakerWorldImportButtonState disables import when a visible Log in control is present', () => {
  const state = resolveMakerWorldImportButtonState(
    createDocument([createControl({ textContent: 'Log in' })]),
    'https://makerworld.com/en/models/578636-the-best-sword-in-the-world'
  )

  assert.equal(state.showButton, true)
  assert.equal(state.disabled, true)
  assert.equal(state.label, 'Import to PrintStream (log in required)')
  assert.match(state.title, /log in to makerworld first/i)
})

test('resolveMakerWorldImportButtonState ignores hidden login prompts', () => {
  const state = resolveMakerWorldImportButtonState(
    createDocument([createControl({ textContent: 'Log in', hidden: true })]),
    'https://makerworld.com/en/models/578636-the-best-sword-in-the-world'
  )

  assert.equal(state.showButton, true)
  assert.equal(state.disabled, false)
  assert.equal(state.label, 'Import to PrintStream')
})

function createDocument(controls) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, 'a, button, [role="button"]')
      return controls
    }
  }
}

function createControl({ textContent = '', hidden = false, attributes = {}, style = {} } = {}) {
  return {
    textContent,
    hidden,
    getAttribute(name) {
      return attributes[name] ?? null
    },
    style
  }
}
