import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { buildCandidateImportResponse } from './background.js'

const originalChrome = globalThis.chrome
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.chrome = originalChrome
  globalThis.fetch = originalFetch
})

test('buildCandidateImportResponse resolves MakerWorld candidates to a direct import URL', async () => {
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => ({
          printStreamBaseUrl: 'http://localhost:5173',
          printStreamTenantSlug: 'Default'
        })
      }
    }
  }
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/api/plugins/remote-imports/extension-context')) {
      return extensionContextResponse()
    }
    assert.equal(String(url), 'https://makerworld.com/api/v1/design-service/instance/33200/f3mf')
    return new Response(JSON.stringify({
      name: 'ProClip V2 (Official).3mf',
      url: 'https://makerworld.com/files/proclip-v2.3mf?Signature=signed'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const response = await buildCandidateImportResponse({
    pageUrl: 'https://makerworld.com/en/models/30298-proclip-filament-clip?from=search#profileId-33200',
    candidate: {
      provider: 'makerworld',
      sourceUrl: 'https://makerworld.com/en/models/30298-proclip-filament-clip?from=search#profileId-33200',
      name: 'ProClip V2.3mf',
      printableStatus: 'import-only',
      instanceId: 33200
    },
    candidates: []
  })

  assert.equal(response.ok, true)
  const resultUrl = new URL(response.resultUrl)
  assert.equal(resultUrl.pathname, '/workspaces/default/import')
  assert.equal(resultUrl.searchParams.get('url'), 'https://makerworld.com/en/models/30298-proclip-filament-clip?from=search#profileId-33200')
  assert.equal(
    resultUrl.searchParams.get('candidate'),
    'https://makerworld.com/files/proclip-v2.3mf?Signature=signed'
  )
  assert.match(resultUrl.searchParams.get('candidates') ?? '', /ProClip V2 \(Official\)\.3mf/)
})

test('buildCandidateImportResponse falls back to the unresolved provider page when resolution fails', async () => {
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => ({
          printStreamBaseUrl: 'http://localhost:5173',
          printStreamTenantSlug: 'default'
        })
      }
    }
  }
  globalThis.fetch = async () => new Response('boom', { status: 500 })

  const response = await buildCandidateImportResponse({
    pageUrl: 'https://makerworld.com/en/models/30298-proclip-filament-clip?from=search#profileId-33200',
    candidate: {
      provider: 'makerworld',
      sourceUrl: 'https://makerworld.com/en/models/30298-proclip-filament-clip?from=search#profileId-33200',
      name: 'ProClip V2.3mf',
      printableStatus: 'import-only',
      instanceId: 33200
    },
    candidates: []
  })

  assert.equal(response.ok, false)
  const fallbackUrl = new URL(response.fallbackUrl)
  assert.equal(fallbackUrl.pathname, '/workspaces/default/import')
  assert.equal(
    fallbackUrl.searchParams.get('candidate'),
    'https://makerworld.com/en/models/30298-proclip-filament-clip?from=search#profileId-33200'
  )
})

test('buildCandidateImportResponse always opens the import handoff page', async () => {
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => ({
          printStreamBaseUrl: 'http://localhost:5173',
          printStreamTenantSlug: 'default'
        })
      }
    }
  }
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/api/plugins/remote-imports/extension-context')) {
      return extensionContextResponse()
    }
    if (String(url) === 'https://files.printables.com/model.stl') {
      return new Response('mesh', { status: 200 })
    }
    throw new Error(`Unexpected fetch ${url}`)
  }

  const response = await buildCandidateImportResponse({
    pageUrl: 'https://www.printables.com/model/123-widget/files',
    candidate: {
      provider: 'printables',
      sourceUrl: 'https://files.printables.com/model.stl',
      name: 'model.stl'
    },
    candidates: []
  })

  assert.equal(response.ok, true)
  const resultUrl = new URL(response.resultUrl)
  assert.equal(resultUrl.pathname, '/workspaces/default/import')
  assert.equal(resultUrl.searchParams.get('url'), 'https://www.printables.com/model/123-widget/files')
  assert.equal(resultUrl.searchParams.get('candidate'), 'https://files.printables.com/model.stl')
  assert.match(resultUrl.searchParams.get('candidates') ?? '', /model\.stl/)
})

test('buildCandidateImportResponse sends unauthenticated users to PrintStream before importing', async () => {
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => ({
          printStreamBaseUrl: 'http://localhost:5173',
          printStreamTenantSlug: 'default'
        })
      }
    },
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`
    }
  }
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'http://localhost:5173/api/plugins/remote-imports/extension-context')
    return new Response(JSON.stringify({
      authenticated: false,
      authEnabled: true,
      setupRequired: false,
      workspaces: []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const response = await buildCandidateImportResponse({
    pageUrl: 'https://www.printables.com/model/123-widget/files',
    candidate: {
      provider: 'printables',
      sourceUrl: 'https://files.printables.com/model.stl',
      name: 'model.stl'
    },
    candidates: []
  })

  assert.equal(response.ok, false)
  assert.equal(response.fallbackUrl, 'http://localhost:5173')
  assert.match(response.error, /login/i)
})

test('buildCandidateImportResponse switches to an import-ready workspace after account changes', async () => {
  const stored = {
    printStreamBaseUrl: 'http://localhost:5173',
    printStreamTenantSlug: 'old-workspace'
  }
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => stored,
        set: async (value) => Object.assign(stored, value)
      }
    },
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`
    }
  }
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/api/plugins/remote-imports/extension-context')) {
      return new Response(JSON.stringify({
        authenticated: true,
        authEnabled: true,
        setupRequired: false,
        workspaces: [
          {
            tenant: {
              id: 'tenant-new',
              slug: 'new-workspace',
              name: 'New Workspace'
            },
            bridgeCount: 1
          }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    if (String(url) === 'https://files.printables.com/model.stl') {
      return new Response('mesh', { status: 200 })
    }
    throw new Error(`Unexpected fetch ${url}`)
  }

  const response = await buildCandidateImportResponse({
    pageUrl: 'https://www.printables.com/model/123-widget/files',
    candidate: {
      provider: 'printables',
      sourceUrl: 'https://files.printables.com/model.stl',
      name: 'model.stl'
    },
    candidates: []
  })

  assert.equal(response.ok, true)
  assert.equal(stored.printStreamTenantSlug, 'new-workspace')
  assert.equal(new URL(response.resultUrl).pathname, '/workspaces/new-workspace/import')
  assert.equal(new URL(response.resultUrl).searchParams.get('candidate'), 'https://files.printables.com/model.stl')
})

test('buildCandidateImportResponse skips selected workspaces that have no bridge', async () => {
  const stored = {
    printStreamBaseUrl: 'http://localhost:5173',
    printStreamTenantSlug: 'no-bridge-workspace'
  }
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => stored,
        set: async (value) => Object.assign(stored, value)
      }
    },
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`
    }
  }
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/api/plugins/remote-imports/extension-context')) {
      return new Response(JSON.stringify({
        authenticated: true,
        authEnabled: true,
        setupRequired: false,
        workspaces: [
          {
            tenant: {
              id: 'tenant-disabled',
              slug: 'no-bridge-workspace',
              name: 'No Bridge Workspace'
            },
            bridgeCount: 0
          },
          {
            tenant: {
              id: 'tenant-ready',
              slug: 'ready-workspace',
              name: 'Ready Workspace'
            },
            bridgeCount: 1
          }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    if (String(url) === 'https://files.printables.com/model.stl') {
      return new Response('mesh', { status: 200 })
    }
    throw new Error(`Unexpected fetch ${url}`)
  }

  const response = await buildCandidateImportResponse({
    pageUrl: 'https://www.printables.com/model/123-widget/files',
    candidate: {
      provider: 'printables',
      sourceUrl: 'https://files.printables.com/model.stl',
      name: 'model.stl'
    },
    candidates: []
  })

  assert.equal(response.ok, true)
  assert.equal(stored.printStreamTenantSlug, 'ready-workspace')
  assert.equal(new URL(response.resultUrl).pathname, '/workspaces/ready-workspace/import')
  assert.equal(new URL(response.resultUrl).searchParams.get('candidate'), 'https://files.printables.com/model.stl')
})

function extensionContextResponse() {
  return new Response(JSON.stringify({
    authenticated: true,
    authEnabled: true,
    setupRequired: false,
    workspaces: [
      {
        tenant: {
          id: 'tenant-1',
          slug: 'default',
          name: 'Default'
        },
        bridgeCount: 1
      }
    ]
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
