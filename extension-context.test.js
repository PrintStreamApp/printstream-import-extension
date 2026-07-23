import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isExtensionContextInvalidatedError } from './extension-context.js'

test('isExtensionContextInvalidatedError matches Chrome extension invalidation errors', () => {
  assert.equal(isExtensionContextInvalidatedError(new Error('Extension context invalidated.')), true)
  assert.equal(isExtensionContextInvalidatedError(new Error('Something else')), false)
  assert.equal(isExtensionContextInvalidatedError(null), false)
})
