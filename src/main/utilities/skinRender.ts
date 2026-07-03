export interface PixelSurface {
  width: number
  height: number
  data: Uint8Array
}

export function blit(
  src: PixelSurface,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dst: PixelSurface,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): void {
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return

  for (let y = 0; y < dh; y++) {
    const srcY = sy + Math.floor((y * sh) / dh)
    const dstY = dy + y
    if (srcY < 0 || srcY >= src.height || dstY < 0 || dstY >= dst.height) {
      continue
    }

    for (let x = 0; x < dw; x++) {
      const srcX = sx + Math.floor((x * sw) / dw)
      const dstX = dx + x
      if (srcX < 0 || srcX >= src.width || dstX < 0 || dstX >= dst.width) {
        continue
      }

      const si = (srcY * src.width + srcX) * 4
      const di = (dstY * dst.width + dstX) * 4
      const srcA = src.data[si + 3]

      if (srcA === 0) continue

      if (srcA === 255) {
        dst.data[di] = src.data[si]
        dst.data[di + 1] = src.data[si + 1]
        dst.data[di + 2] = src.data[si + 2]
        dst.data[di + 3] = 255
        continue
      }

      const sa = srcA / 255
      const da = dst.data[di + 3] / 255
      const outA = sa + da * (1 - sa)

      if (outA === 0) {
        dst.data[di] = 0
        dst.data[di + 1] = 0
        dst.data[di + 2] = 0
        dst.data[di + 3] = 0
        continue
      }

      for (let c = 0; c < 3; c++) {
        dst.data[di + c] = Math.round(
          (src.data[si + c] * sa + dst.data[di + c] * da * (1 - sa)) / outA
        )
      }
      dst.data[di + 3] = Math.round(outA * 255)
    }
  }
}
