export interface IAuthlib {
  url: string
  name: string
  sha1: string
  size: number
  path: string
  version: string
}

export type AuthlibEnsureResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'download_failed' }
