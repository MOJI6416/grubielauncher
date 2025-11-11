import { createHash } from 'crypto'

export function generateOfflineUUID(username: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${username}`).digest('hex')
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '3' + hash.substring(13, 16),
    hash.substring(16, 20),
    hash.substring(20, 32)
  ].join('')
}
