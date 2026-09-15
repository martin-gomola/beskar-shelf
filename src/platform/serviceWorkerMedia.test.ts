/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workerSource = readFileSync(
  `${process.cwd()}/public/sw.js`,
  'utf8',
)

describe('service worker media routing', () => {
  it('leaves audio and byte-range requests on the native browser media path', () => {
    const fetchHandler = workerSource.indexOf("self.addEventListener('fetch'")
    const mediaBypass = workerSource.indexOf("request.destination === 'audio'")
    const absInterception = workerSource.indexOf("url.pathname.startsWith('/abs/')")

    expect(fetchHandler).toBeGreaterThanOrEqual(0)
    expect(mediaBypass).toBeGreaterThan(fetchHandler)
    expect(mediaBypass).toBeLessThan(absInterception)
    expect(workerSource).toContain("request.headers.has('range')")
  })
})
