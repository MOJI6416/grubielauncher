import { TSettings } from '../types/Settings'

export interface InstanceSettingsOverrides {
  xmx?: number
  optimizedJvm?: boolean
  highPriority?: boolean
}

export const OVERRIDABLE_KEYS = [
  'xmx',
  'optimizedJvm',
  'highPriority'
] as const

export type OverridableKey = (typeof OVERRIDABLE_KEYS)[number]

export function isOverridden(
  overrides: InstanceSettingsOverrides | undefined,
  key: OverridableKey
): boolean {
  if (!overrides) return false
  return overrides[key] !== undefined
}

export function countOverrides(
  overrides: InstanceSettingsOverrides | undefined
): number {
  return OVERRIDABLE_KEYS.filter((key) => isOverridden(overrides, key)).length
}

export function resolveInstanceSettings(
  global: TSettings,
  overrides?: InstanceSettingsOverrides
): TSettings {
  if (!overrides) return global

  const resolved: TSettings = { ...global }

  if (typeof overrides.xmx === 'number' && Number.isFinite(overrides.xmx)) {
    resolved.xmx = Math.max(1024, Math.round(overrides.xmx))
  }

  if (typeof overrides.optimizedJvm === 'boolean') {
    resolved.optimizedJvm = overrides.optimizedJvm
  }

  if (typeof overrides.highPriority === 'boolean') {
    resolved.highPriority = overrides.highPriority
  }

  return resolved
}

export function setOverride<K extends OverridableKey>(
  overrides: InstanceSettingsOverrides | undefined,
  key: K,
  value: InstanceSettingsOverrides[K]
): InstanceSettingsOverrides {
  return { ...(overrides ?? {}), [key]: value }
}

export function clearOverride(
  overrides: InstanceSettingsOverrides | undefined,
  key: OverridableKey
): InstanceSettingsOverrides | undefined {
  if (!overrides) return undefined

  const next = { ...overrides }
  delete next[key]

  return countOverrides(next) > 0 ? next : undefined
}
