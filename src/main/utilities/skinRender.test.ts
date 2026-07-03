import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { blit, PixelSurface } from './skinRender'

function makeSurface(width: number, height: number): PixelSurface {
  return { width, height, data: new Uint8Array(width * height * 4) }
}

function setPixel(
  surface: PixelSurface,
  x: number,
  y: number,
  rgba: [number, number, number, number]
): void {
  const i = (y * surface.width + x) * 4
  surface.data[i] = rgba[0]
  surface.data[i + 1] = rgba[1]
  surface.data[i + 2] = rgba[2]
  surface.data[i + 3] = rgba[3]
}

function getPixel(
  surface: PixelSurface,
  x: number,
  y: number
): [number, number, number, number] {
  const i = (y * surface.width + x) * 4
  return [
    surface.data[i],
    surface.data[i + 1],
    surface.data[i + 2],
    surface.data[i + 3]
  ]
}

describe('blit', () => {
  it('copies an opaque region 1:1', () => {
    const src = makeSurface(4, 4)
    const dst = makeSurface(4, 4)
    setPixel(src, 1, 1, [10, 20, 30, 255])
    setPixel(src, 2, 1, [40, 50, 60, 255])

    blit(src, 1, 1, 2, 1, dst, 0, 0, 2, 1)

    expect(getPixel(dst, 0, 0)).toEqual([10, 20, 30, 255])
    expect(getPixel(dst, 1, 0)).toEqual([40, 50, 60, 255])
    expect(getPixel(dst, 2, 0)).toEqual([0, 0, 0, 0])
  })

  it('scales with nearest neighbor', () => {
    const src = makeSurface(2, 1)
    const dst = makeSurface(4, 2)
    setPixel(src, 0, 0, [255, 0, 0, 255])
    setPixel(src, 1, 0, [0, 255, 0, 255])

    blit(src, 0, 0, 2, 1, dst, 0, 0, 4, 2)

    expect(getPixel(dst, 0, 0)).toEqual([255, 0, 0, 255])
    expect(getPixel(dst, 1, 0)).toEqual([255, 0, 0, 255])
    expect(getPixel(dst, 2, 0)).toEqual([0, 255, 0, 255])
    expect(getPixel(dst, 3, 0)).toEqual([0, 255, 0, 255])
    expect(getPixel(dst, 0, 1)).toEqual([255, 0, 0, 255])
    expect(getPixel(dst, 3, 1)).toEqual([0, 255, 0, 255])
  })

  it('skips fully transparent source pixels', () => {
    const src = makeSurface(1, 1)
    const dst = makeSurface(1, 1)
    setPixel(src, 0, 0, [255, 255, 255, 0])
    setPixel(dst, 0, 0, [10, 20, 30, 255])

    blit(src, 0, 0, 1, 1, dst, 0, 0, 1, 1)

    expect(getPixel(dst, 0, 0)).toEqual([10, 20, 30, 255])
  })

  it('blends semi-transparent source over opaque destination', () => {
    const src = makeSurface(1, 1)
    const dst = makeSurface(1, 1)
    setPixel(src, 0, 0, [255, 0, 0, 128])
    setPixel(dst, 0, 0, [0, 0, 255, 255])

    blit(src, 0, 0, 1, 1, dst, 0, 0, 1, 1)

    const [r, , b, a] = getPixel(dst, 0, 0)
    expect(a).toBe(255)
    expect(r).toBeGreaterThan(120)
    expect(r).toBeLessThan(136)
    expect(b).toBeGreaterThan(119)
    expect(b).toBeLessThan(135)
  })

  it('overlay layer replaces base where opaque, keeps base where transparent', () => {
    const base = makeSurface(2, 1)
    const overlay = makeSurface(2, 1)
    const dst = makeSurface(2, 1)
    setPixel(base, 0, 0, [1, 2, 3, 255])
    setPixel(base, 1, 0, [4, 5, 6, 255])
    setPixel(overlay, 0, 0, [7, 8, 9, 255])
    setPixel(overlay, 1, 0, [0, 0, 0, 0])

    blit(base, 0, 0, 2, 1, dst, 0, 0, 2, 1)
    blit(overlay, 0, 0, 2, 1, dst, 0, 0, 2, 1)

    expect(getPixel(dst, 0, 0)).toEqual([7, 8, 9, 255])
    expect(getPixel(dst, 1, 0)).toEqual([4, 5, 6, 255])
  })

  it('ignores out-of-bounds destination writes', () => {
    const src = makeSurface(2, 2)
    const dst = makeSurface(2, 2)
    setPixel(src, 0, 0, [9, 9, 9, 255])
    setPixel(src, 1, 1, [8, 8, 8, 255])

    blit(src, 0, 0, 2, 2, dst, 1, 1, 2, 2)

    expect(getPixel(dst, 1, 1)).toEqual([9, 9, 9, 255])
    expect(getPixel(dst, 0, 0)).toEqual([0, 0, 0, 0])
  })
})

describe('pngjs pipeline', () => {
  it('encodes a blitted skin head region to PNG and back', () => {
    const scale = 4
    const skin = new PNG({ width: 64, height: 64 })
    for (let y = 8; y < 16; y++) {
      for (let x = 8; x < 16; x++) {
        const i = (y * 64 + x) * 4
        skin.data[i] = 200
        skin.data[i + 1] = 150
        skin.data[i + 2] = 100
        skin.data[i + 3] = 255
      }
    }

    const parsed = PNG.sync.read(PNG.sync.write(skin))
    const out = new PNG({ width: 16 * scale, height: 32 * scale })
    blit(parsed, 8, 8, 8, 8, out, 4 * scale, 0, 8 * scale, 8 * scale)

    const encoded = PNG.sync.write(out)
    const decoded = PNG.sync.read(encoded)

    expect(decoded.width).toBe(64)
    expect(decoded.height).toBe(128)

    const center = ((4 * scale + 1) + (16 * 4 + 1) * 0) * 4
    expect(decoded.data[center]).toBe(200)
    expect(decoded.data[center + 1]).toBe(150)
    expect(decoded.data[center + 2]).toBe(100)
    expect(decoded.data[center + 3]).toBe(255)

    const outside = (2 * 4)
    expect(decoded.data[outside + 3]).toBe(0)

    const dataUrl = `data:image/png;base64,${encoded.toString('base64')}`
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(dataUrl.length).toBeGreaterThan(100)
  })
})
