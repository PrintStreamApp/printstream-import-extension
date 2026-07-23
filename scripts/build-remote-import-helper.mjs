import path from 'node:path'
import { buildRemoteImportHelperArchive } from './lib/build-remote-import-helper.mjs'

const workspaceRoot = path.resolve(new URL('..', import.meta.url).pathname)
const outputPath = await buildRemoteImportHelperArchive({ workspaceRoot })
console.log(`Wrote ${path.relative(workspaceRoot, outputPath)}`)
