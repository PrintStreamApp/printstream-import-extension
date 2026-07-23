import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPageBinding, matchesPageBinding } from './page-binding.js'

test('matchesPageBinding treats Printables model and files tabs as the same logical page', () => {
  const binding = createPageBinding('printables', 'https://www.printables.com/model/123-widget')

  assert.equal(matchesPageBinding(binding, 'printables', 'https://www.printables.com/model/123-widget/files'), true)
  assert.equal(matchesPageBinding(binding, 'printables', 'https://www.printables.com/model/123-widget/comments'), true)
})

test('matchesPageBinding rejects different Printables models', () => {
  const binding = createPageBinding('printables', 'https://www.printables.com/model/123-widget')

  assert.equal(matchesPageBinding(binding, 'printables', 'https://www.printables.com/model/999-other/files'), false)
})

test('matchesPageBinding keeps exact URL matching for non-Printables providers', () => {
  const binding = createPageBinding('makerworld', 'https://makerworld.com/en/models/1-a')

  assert.equal(matchesPageBinding(binding, 'makerworld', 'https://makerworld.com/en/models/1-a'), true)
  assert.equal(matchesPageBinding(binding, 'makerworld', 'https://makerworld.com/en/models/2-b'), false)
})
