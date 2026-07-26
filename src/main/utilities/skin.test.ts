import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { assertSkinBuffer, isSupportedSkinGeometry, readPngHeader } from './skin'

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
