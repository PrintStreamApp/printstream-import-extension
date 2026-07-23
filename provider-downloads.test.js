import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveCandidateDownload, MAKERWORLD_REQUEST_HEADERS } from './provider-downloads.js'

test('resolveCandidateDownload resolves MakerWorld instance candidates through the f3mf endpoint', async () => {
  let requestUrl = ''
  let requestInit = null

  const result = await resolveCandidateDownload({
    provider: 'makerworld',
    sourceUrl: 'https://makerworld.com/en/models/30298-proclip-filament-clip#profileId-33200',
    name: 'ProClip V2.3mf',
    instanceId: 33200
  }, async (input, init) => {
    requestUrl = String(input)
    requestInit = init
    return new Response(JSON.stringify({
      name: 'ProClip V2 (Official).3mf',
      url: 'https://makerworld.bblmw.com/example.3mf?sig=123'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  })

  assert.equal(requestUrl, 'https://makerworld.com/api/v1/design-service/instance/33200/f3mf')
  assert.deepEqual(requestInit, {
    credentials: 'include',
    headers: MAKERWORLD_REQUEST_HEADERS
  })
  assert.deepEqual(result, {
    name: 'ProClip V2 (Official).3mf',
    sourceUrl: 'https://makerworld.bblmw.com/example.3mf?sig=123'
  })
})

test('resolveCandidateDownload falls back to the candidate source URL for generic providers', async () => {
  const result = await resolveCandidateDownload({
    provider: 'printables',
    sourceUrl: 'https://cdn.printables.com/model.stl',
    name: 'model.stl'
  })

  assert.deepEqual(result, {
    name: 'model.stl',
    sourceUrl: 'https://cdn.printables.com/model.stl'
  })
})

test('resolveCandidateDownload normalizes MakerWorld 418 responses as captcha failures', async () => {
  await assert.rejects(
    resolveCandidateDownload({
      provider: 'makerworld',
      sourceUrl: 'https://makerworld.com/en/models/30298-proclip-filament-clip#profileId-33200',
      name: 'ProClip V2.3mf',
      instanceId: 33200
    }, async () => new Response('robot check', { status: 418 })),
    /captcha challenge/i
  )
})
