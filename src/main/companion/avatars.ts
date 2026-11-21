import axios from 'axios'
import type { CompanionAvatarSource } from './CompanionBridge'

const MAX_AVATAR_BYTES = 64 * 1024
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

export function createAvatarSource(
  fetchBytes: (url: string) => Promise<Uint8Array> = async (url) => {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 8000,
      maxContentLength: MAX_AVATAR_BYTES
    })
    return new Uint8Array(response.data)
  }
): CompanionAvatarSource {
  const cache = new Map<string, Promise<string | null>>()
  return {
    png(_id, url) {
      let pending = cache.get(url)
      if (!pending) {
        pending = fetchBytes(url)
          .then((bytes) =>
            bytes.length > 0 && bytes.length <= MAX_AVATAR_BYTES && isPng(bytes)
              ? Buffer.from(bytes).toString('base64')
              : null
          )
          .catch(() => {
            cache.delete(url)
            return null
          })
        cache.set(url, pending)
      }
      return pending
    }
  }
}
