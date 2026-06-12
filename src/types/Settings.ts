export const LANGUAGES = [
  { code: 'en', label: 'English', country: 'GB' },
  { code: 'ru', label: 'Русский', country: 'RU' },
  { code: 'uk', label: 'Українська', country: 'UA' }
]

export type TSettings = {
  xmx: number
  lang: string
  devMode: boolean
  downloadLimit: number
  crashTelemetry: boolean
  sounds: boolean
}

export const DEFAULT_SETTINGS: TSettings = {
  xmx: 2048,
  lang: 'en',
  devMode: false,
  downloadLimit: 6,
  crashTelemetry: true,
  sounds: true
}

export function normalizeSettings(
  value: Partial<TSettings> | null | undefined,
  fallbackLang = DEFAULT_SETTINGS.lang
): TSettings {
  const xmx = Number(value?.xmx)
  const downloadLimit = Number(value?.downloadLimit)
  const lang =
    typeof value?.lang === 'string' && value.lang.trim()
      ? value.lang
      : fallbackLang

  return {
    xmx: Number.isFinite(xmx) && xmx >= 1024 ? Math.round(xmx) : DEFAULT_SETTINGS.xmx,
    lang,
    devMode: typeof value?.devMode === 'boolean' ? value.devMode : DEFAULT_SETTINGS.devMode,
    downloadLimit:
      Number.isFinite(downloadLimit) && downloadLimit >= 1
        ? Math.min(16, Math.max(1, Math.round(downloadLimit)))
        : DEFAULT_SETTINGS.downloadLimit,
    crashTelemetry:
      typeof value?.crashTelemetry === 'boolean'
        ? value.crashTelemetry
        : DEFAULT_SETTINGS.crashTelemetry,
    sounds: typeof value?.sounds === 'boolean' ? value.sounds : DEFAULT_SETTINGS.sounds
  }
}
