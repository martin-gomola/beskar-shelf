import { describe, expect, it } from 'vitest'

import { resolveServerMode } from './utils'

describe('resolveServerMode', () => {
  it('uses the static ABS proxy when a proxy base is configured', () => {
    expect(resolveServerMode('/abs', undefined)).toBe('proxy')
    expect(resolveServerMode('/abs', 'false')).toBe('proxy')
  })

  it('uses the dynamic proxy only when explicitly enabled', () => {
    expect(resolveServerMode('/abs', 'true')).toBe('dynamic-proxy')
    expect(resolveServerMode('/abs', '1')).toBe('dynamic-proxy')
    expect(resolveServerMode('/abs', true)).toBe('dynamic-proxy')
  })

  it('falls back to direct requests when no proxy is configured', () => {
    expect(resolveServerMode('', undefined)).toBe('direct')
  })
})
