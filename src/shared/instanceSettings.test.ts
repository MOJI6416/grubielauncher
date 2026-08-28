import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, TSettings } from '../types/Settings'
import {
  clearOverride,
  countOverrides,
  isOverridden,
  resolveInstanceSettings,
  setOverride
} from './instanceSettings'

const global: TSettings = {
  ...DEFAULT_SETTINGS,
  xmx: 4096,
  optimizedJvm: true,
  highPriority: false
}

describe('resolveInstanceSettings', () => {
  it('returns the global settings untouched when nothing is overridden', () => {
    expect(resolveInstanceSettings(global)).toBe(global)
    expect(resolveInstanceSettings(global, {})).toEqual(global)
  })

  it('overrides only the fields that are set', () => {
    const resolved = resolveInstanceSettings(global, { xmx: 8192 })

    expect(resolved.xmx).toBe(8192)
    expect(resolved.optimizedJvm).toBe(global.optimizedJvm)
    expect(resolved.lang).toBe(global.lang)
  })

  it('keeps the global value when an override is undefined', () => {
    const resolved = resolveInstanceSettings(global, { xmx: undefined })
    expect(resolved.xmx).toBe(4096)
  })

  it('allows turning a boolean off, not just on', () => {
    const resolved = resolveInstanceSettings(global, { optimizedJvm: false })
    expect(resolved.optimizedJvm).toBe(false)
  })

  it('never drops memory below the launcher minimum', () => {
    expect(resolveInstanceSettings(global, { xmx: 256 }).xmx).toBe(1024)
  })

  it('rounds a fractional memory value', () => {
    expect(resolveInstanceSettings(global, { xmx: 2048.6 }).xmx).toBe(2049)
  })

  it('ignores a broken memory value', () => {
    expect(resolveInstanceSettings(global, { xmx: NaN }).xmx).toBe(4096)
  })

  it('does not mutate the global settings', () => {
    resolveInstanceSettings(global, { xmx: 8192, highPriority: true })

    expect(global.xmx).toBe(4096)
    expect(global.highPriority).toBe(false)
  })
})

describe('override bookkeeping', () => {
  it('knows which fields are overridden', () => {
    expect(isOverridden(undefined, 'xmx')).toBe(false)
    expect(isOverridden({}, 'xmx')).toBe(false)
    expect(isOverridden({ xmx: 2048 }, 'xmx')).toBe(true)
    expect(isOverridden({ optimizedJvm: false }, 'optimizedJvm')).toBe(true)
  })

  it('counts them', () => {
    expect(countOverrides(undefined)).toBe(0)
    expect(countOverrides({ xmx: 2048, highPriority: true })).toBe(2)
  })

  it('adds an override without touching the others', () => {
    const next = setOverride({ xmx: 2048 }, 'optimizedJvm', false)

    expect(next).toEqual({ xmx: 2048, optimizedJvm: false })
  })

  it('drops an override and returns undefined once none are left', () => {
    expect(clearOverride({ xmx: 2048 }, 'xmx')).toBeUndefined()
    expect(clearOverride({ xmx: 2048, highPriority: true }, 'xmx')).toEqual({
      highPriority: true
    })
    expect(clearOverride(undefined, 'xmx')).toBeUndefined()
  })
})
