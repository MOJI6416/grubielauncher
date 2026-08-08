import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { PNG } from 'pngjs'
import {
  assertSkinBuffer,
  isSupportedSkinGeometry,
  readPngHeader,
  resolveElybySkinUrl
} from './skin'

function makePng(width: number, height: number): Buffer {
  const png = new PNG({ width, height })
  png.data.fill(255)
  return PNG.sync.write(png)
}

describe('readPngHeader', () => {
  it('reads dimensions straight from the IHDR chunk', () => {
    expect(readPngHeader(makePng(64, 64))).toEqual({ width: 64, height: 64 })
  })

  it('rejects buffers that are not PNG at all', () => {
    expect(readPngHeader(Buffer.from('not a png at all, really'))).toBeNull()
    expect(readPngHeader(Buffer.alloc(4))).toBeNull()
  })
})

describe('isSupportedSkinGeometry', () => {
  it('accepts both modern and legacy skin layouts', () => {
    expect(isSupportedSkinGeometry({ width: 64, height: 64 })).toBe(true)
    expect(isSupportedSkinGeometry({ width: 64, height: 32 })).toBe(true)
  })

  it('accepts scaled-up 2:1 textures used for capes', () => {
    expect(isSupportedSkinGeometry({ width: 128, height: 64 })).toBe(true)
  })

  it('refuses arbitrary images', () => {
    expect(isSupportedSkinGeometry({ width: 1920, height: 1080 })).toBe(false)
    expect(isSupportedSkinGeometry({ width: 16000, height: 16000 })).toBe(false)
    expect(isSupportedSkinGeometry(null)).toBe(false)
  })
})

describe('assertSkinBuffer', () => {
  it('passes a normal skin through and reports its size', () => {
    expect(assertSkinBuffer(makePng(64, 64))).toEqual({ width: 64, height: 64 })
  })

  it('refuses a decompression bomb before it is ever decoded', () => {
    expect(() => assertSkinBuffer(makePng(2000, 1000))).toThrow()
  })

  it('refuses oversized files without looking at the pixels', () => {
    expect(() => assertSkinBuffer(Buffer.alloc(2 * 1024 * 1024))).toThrow(
      /too large/
    )
  })
})

describe('resolveElybySkinUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('upgrades the plaintext redirect target ely.by hands out', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      status: 301,
      headers: { location: 'http://ely.by/storage/skins/abc.png' },
      data: { destroy: () => undefined }
    } as never)

    await expect(resolveElybySkinUrl('erickskrauch')).resolves.toBe(
      'https://ely.by/storage/skins/abc.png'
    )
  })

  it('resolves a relative redirect against the skin system origin', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      status: 302,
      headers: { location: '/storage/skins/abc.png' },
      data: { destroy: () => undefined }
    } as never)

    await expect(resolveElybySkinUrl('nick')).resolves.toBe(
      'https://skinsystem.ely.by/storage/skins/abc.png'
    )
  })

  it('keeps the skin system url when nothing redirects', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      status: 200,
      headers: {},
      data: { destroy: () => undefined }
    } as never)

    await expect(resolveElybySkinUrl('nick')).resolves.toMatch(
      /^https:\/\/skinsystem\.ely\.by\/skins\/nick\.png\?timestamp=\d+$/
    )
  })

  it('falls back to the skin system url when the probe fails', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('offline'))

    await expect(resolveElybySkinUrl('nick')).resolves.toMatch(
      /^https:\/\/skinsystem\.ely\.by\/skins\/nick\.png\?timestamp=\d+$/
    )
  })

  it('never hands back a plaintext url, whatever the redirect says', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      status: 301,
      headers: { location: 'ftp://ely.by/storage/skins/abc.png' },
      data: { destroy: () => undefined }
    } as never)

    await expect(resolveElybySkinUrl('nick')).resolves.toMatch(/^https:/)
  })
})
