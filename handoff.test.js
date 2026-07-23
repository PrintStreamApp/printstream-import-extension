import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildImportPageUrl, buildImportResultUrl, resolveUploadBridgeId } from './handoff.js'

test('buildImportPageUrl includes provider page, selected candidate, and chooser candidates', () => {
  const url = new URL(buildImportPageUrl(
    'http://localhost:5173/',
    'Default',
    'https://www.printables.com/model/1-widget',
    [{ name: 'widget.gcode.3mf', sourceUrl: 'https://files.printables.com/widget.gcode.3mf' }],
    'https://files.printables.com/widget.gcode.3mf'
  ))

  assert.equal(url.origin, 'http://localhost:5173')
  assert.equal(url.pathname, '/workspaces/default/import')
  assert.equal(url.searchParams.get('url'), 'https://www.printables.com/model/1-widget')
  assert.equal(url.searchParams.get('candidate'), 'https://files.printables.com/widget.gcode.3mf')
  assert.match(url.searchParams.get('candidates') ?? '', /widget\.gcode\.3mf/)
})

test('buildImportPageUrl falls back to the default workspace for blank tenant slugs', () => {
  const url = new URL(buildImportPageUrl(
    'http://localhost:5173',
    '',
    'https://www.printables.com/model/123-widget/files',
    []
  ))

  assert.equal(url.pathname, '/workspaces/default/import')
  assert.equal(url.searchParams.get('url'), 'https://www.printables.com/model/123-widget/files')
})

test('buildImportResultUrl opens print setup only when the upload response is printer-ready', () => {
  const printable = new URL(buildImportResultUrl('https://hub.example', 'production', {
    canPrintDirectly: true,
    file: { id: 'file-1', name: 'widget.gcode.3mf' }
  }))
  const modelOnly = new URL(buildImportResultUrl('https://hub.example', 'production', {
    canPrintDirectly: false,
    file: { id: 'file-2', name: 'widget.stl' }
  }))

  assert.equal(printable.pathname, '/workspaces/production/import')
  assert.equal(printable.searchParams.get('uploadedFileId'), 'file-1')
  assert.match(printable.searchParams.get('uploadedFile') ?? '', /widget\.gcode\.3mf/)
  assert.equal(printable.searchParams.get('print'), '1')
  assert.equal(modelOnly.searchParams.has('print'), false)
})

test('resolveUploadBridgeId only auto-selects a bridge when unambiguous', () => {
  assert.equal(resolveUploadBridgeId({ activeBridgeId: 'bridge-active', bridgeEntries: [] }), 'bridge-active')
  assert.equal(resolveUploadBridgeId({ activeBridgeId: null, bridgeEntries: [{ id: 'bridge-one' }] }), 'bridge-one')
  assert.equal(resolveUploadBridgeId({ activeBridgeId: null, bridgeEntries: [{ id: 'a' }, { id: 'b' }] }), null)
})
