import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { buildStoredZip } from './lib/build-remote-import-helper.mjs'

test('buildStoredZip writes a central directory with every helper file path', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'bambu-remote-helper-'))
  try {
    const sourceDir = path.join(tempDir, 'helper')
    await mkdir(path.join(sourceDir, 'nested'), { recursive: true })
    const manifestPath = path.join(sourceDir, 'manifest.json')
    const scriptPath = path.join(sourceDir, 'nested', 'content.js')
    await writeFile(manifestPath, '{"name":"helper"}')
    await writeFile(scriptPath, 'console.log("ok")')

    const zipBuffer = await buildStoredZip([
      { sourcePath: manifestPath, zipPath: 'printstream-remote-import-helper/manifest.json' },
      { sourcePath: scriptPath, zipPath: 'printstream-remote-import-helper/nested/content.js' }
    ], new Date('2026-05-13T12:00:00Z'))

    assert.equal(zipBuffer.readUInt32LE(zipBuffer.length - 22), 0x06054b50)
    assert.equal(zipBuffer.readUInt16LE(zipBuffer.length - 14), 2)

    const centralDirectoryOffset = zipBuffer.readUInt32LE(zipBuffer.length - 6)
    const centralDirectory = zipBuffer.subarray(centralDirectoryOffset, zipBuffer.length - 22)
    const centralDirectoryText = centralDirectory.toString('utf8')

    assert.match(centralDirectoryText, /printstream-remote-import-helper\/manifest\.json/)
    assert.match(centralDirectoryText, /printstream-remote-import-helper\/nested\/content\.js/)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
