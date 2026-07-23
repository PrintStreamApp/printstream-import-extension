import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const remoteImportHelperArchiveName = 'printstream-remote-import-helper.zip'
export const remoteImportHelperExtractedFolderName = 'printstream-remote-import-helper'

// Dev-only entries that live in the repo root but must stay out of the packaged extension.
const defaultIgnore = new Set(['scripts', 'node_modules', '.git', 'package.json', 'package-lock.json', 'README.md', '.gitignore', 'dist'])

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
    }
    table[index] = value >>> 0
  }
  return table
})()

export async function buildRemoteImportHelperArchive({
  workspaceRoot,
  sourceDir = workspaceRoot,
  outputDir = path.join(workspaceRoot, 'dist'),
  archiveName = remoteImportHelperArchiveName,
  extractedFolderName = remoteImportHelperExtractedFolderName,
  ignore = defaultIgnore
}) {
  await mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, archiveName)
  await rm(outputPath, { force: true })

  const files = await collectFiles(sourceDir, ignore)
  const zipBuffer = await buildStoredZip(files.map((file) => ({
    sourcePath: file,
    zipPath: `${extractedFolderName}/${path.relative(sourceDir, file).split(path.sep).join('/')}`
  })))

  await writeFile(outputPath, zipBuffer)
  return outputPath
}

export async function collectFiles(dirPath, ignore = new Set()) {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (ignore.has(entry.name)) {
      continue
    }
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, ignore))
      continue
    }
    if (entry.isFile()) {
      // Extension tests must not ship inside the packaged archive.
      if (entry.name.endsWith('.test.js')) {
        continue
      }
      files.push(fullPath)
    }
  }

  return files.sort((left, right) => left.localeCompare(right))
}

export async function buildStoredZip(entries, now = new Date()) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const entry of entries) {
    const fileName = Buffer.from(entry.zipPath, 'utf8')
    const fileData = await readFile(entry.sourcePath)
    const crc32 = crc32Buffer(fileData)
    const { dosDate, dosTime } = toDosDateTime(now)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(crc32, 14)
    localHeader.writeUInt32LE(fileData.length, 18)
    localHeader.writeUInt32LE(fileData.length, 22)
    localHeader.writeUInt16LE(fileName.length, 26)
    localHeader.writeUInt16LE(0, 28)
    localParts.push(localHeader, fileName, fileData)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(dosTime, 12)
    centralHeader.writeUInt16LE(dosDate, 14)
    centralHeader.writeUInt32LE(crc32, 16)
    centralHeader.writeUInt32LE(fileData.length, 20)
    centralHeader.writeUInt32LE(fileData.length, 24)
    centralHeader.writeUInt16LE(fileName.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, fileName)

    offset += localHeader.length + fileName.length + fileData.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const endRecord = Buffer.alloc(22)
  endRecord.writeUInt32LE(0x06054b50, 0)
  endRecord.writeUInt16LE(0, 4)
  endRecord.writeUInt16LE(0, 6)
  endRecord.writeUInt16LE(entries.length, 8)
  endRecord.writeUInt16LE(entries.length, 10)
  endRecord.writeUInt32LE(centralDirectory.length, 12)
  endRecord.writeUInt32LE(offset, 16)
  endRecord.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDirectory, endRecord])
}

function toDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear())
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  return { dosDate, dosTime }
}

function crc32Buffer(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
