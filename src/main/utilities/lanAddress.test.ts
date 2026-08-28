import { describe, expect, it } from 'vitest'
import { pickLanAddress } from './lanAddress'

describe('pickLanAddress', () => {
  it('prefers a private ipv4 over a public one', () => {
    expect(
      pickLanAddress({
        eth0: [
          { address: '203.0.113.7', family: 'IPv4', internal: false },
          { address: '192.168.1.42', family: 'IPv4', internal: false }
        ]
      })
    ).toBe('192.168.1.42')
  })

  it('skips loopback, ipv6 and link-local addresses', () => {
    expect(
      pickLanAddress({
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
        eth0: [
          { address: 'fe80::1', family: 'IPv6', internal: false },
          { address: '169.254.10.10', family: 'IPv4', internal: false },
          { address: '10.0.0.5', family: 'IPv4', internal: false }
        ]
      })
    ).toBe('10.0.0.5')
  })

  it('returns null when nothing is routable', () => {
    expect(pickLanAddress({ lo: undefined })).toBeNull()
    expect(
      pickLanAddress({
        lo: [{ address: '127.0.0.1', family: 4, internal: true }]
      })
    ).toBeNull()
  })
})
