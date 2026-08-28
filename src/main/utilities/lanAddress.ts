import os from 'os'

export interface NetworkAddress {
  address: string
  family: string | number
  internal: boolean
}

const PRIVATE_RANGES = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./]

export function pickLanAddress(
  interfaces: Record<string, NetworkAddress[] | undefined>
): string | null {
  const candidates: string[] = []

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue
      if (entry.family !== 'IPv4' && entry.family !== 4) continue
      if (entry.address.startsWith('169.254.')) continue
      candidates.push(entry.address)
    }
  }

  const priv = candidates.find((address) =>
    PRIVATE_RANGES.some((range) => range.test(address))
  )

  return priv ?? candidates[0] ?? null
}

export function getLanAddress(): string | null {
  return pickLanAddress(
    os.networkInterfaces() as Record<string, NetworkAddress[] | undefined>
  )
}
