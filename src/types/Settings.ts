export const LANGUAGES = [
  { code: 'en', label: 'English', country: 'GB' },
  { code: 'ru', label: 'Русский', country: 'RU' },
  { code: 'uk', label: 'Українська', country: 'UA' }
]

export type DownloadSource = 'auto' | 'official' | 'mirror'

export type VoicePttBind = {
  type: 'key' | 'mouse'
  code: number
  label: string
}

export type TSettings = {
  xmx: number
  optimizedJvm: boolean
  highPriority: boolean
  lang: string
  devMode: boolean
  downloadLimit: number
  downloadSource: DownloadSource
  crashTelemetry: boolean
  sounds: boolean
  hideServerInRpc: boolean
  voicePtt: boolean
  voicePttBind: VoicePttBind | null
  voiceNoiseSuppression: boolean
}

export const DEFAULT_SETTINGS: TSettings = {
  xmx: 2048,
  optimizedJvm: true,
  highPriority: false,
  lang: 'en',
  devMode: false,
  downloadLimit: 6,
  downloadSource: 'auto',
  crashTelemetry: true,
  sounds: true,
  hideServerInRpc: false,
  voicePtt: false,
  voicePttBind: null,
  voiceNoiseSuppression: false
}

export function normalizeVoicePttBind(value: unknown): VoicePttBind | null {
  if (!value || typeof value !== 'object') return null

  const bind = value as Partial<VoicePttBind>
  if (bind.type !== 'key' && bind.type !== 'mouse') return null
  if (typeof bind.code !== 'number' || !Number.isFinite(bind.code)) return null

  return {
    type: bind.type,
    code: Math.round(bind.code),
    label: typeof bind.label === 'string' ? bind.label : String(bind.code)
  }
}

export function normalizeSettings(
  value: Partial<TSettings> | null | undefined,
  fallbackLang = DEFAULT_SETTINGS.lang
): TSettings {
  const xmx = Number(value?.xmx)
  const downloadLimit = Number(value?.downloadLimit)
  const downloadSource: DownloadSource =
    value?.downloadSource === 'official' ||
    value?.downloadSource === 'mirror' ||
    value?.downloadSource === 'auto'
      ? value.downloadSource
      : DEFAULT_SETTINGS.downloadSource
  const lang =
    typeof value?.lang === 'string' && value.lang.trim()
      ? value.lang
      : fallbackLang

  return {
    xmx: Number.isFinite(xmx) && xmx >= 1024 ? Math.round(xmx) : DEFAULT_SETTINGS.xmx,
    optimizedJvm:
      typeof value?.optimizedJvm === 'boolean'
        ? value.optimizedJvm
        : DEFAULT_SETTINGS.optimizedJvm,
    highPriority:
      typeof value?.highPriority === 'boolean'
        ? value.highPriority
        : DEFAULT_SETTINGS.highPriority,
    lang,
    devMode: typeof value?.devMode === 'boolean' ? value.devMode : DEFAULT_SETTINGS.devMode,
    downloadLimit:
      Number.isFinite(downloadLimit) && downloadLimit >= 1
        ? Math.min(16, Math.max(1, Math.round(downloadLimit)))
        : DEFAULT_SETTINGS.downloadLimit,
    downloadSource,
    crashTelemetry:
      typeof value?.crashTelemetry === 'boolean'
        ? value.crashTelemetry
        : DEFAULT_SETTINGS.crashTelemetry,
    sounds: typeof value?.sounds === 'boolean' ? value.sounds : DEFAULT_SETTINGS.sounds,
    hideServerInRpc:
      typeof value?.hideServerInRpc === 'boolean'
        ? value.hideServerInRpc
        : DEFAULT_SETTINGS.hideServerInRpc,
    voicePtt:
      typeof value?.voicePtt === 'boolean' ? value.voicePtt : DEFAULT_SETTINGS.voicePtt,
    voicePttBind: normalizeVoicePttBind(value?.voicePttBind),
    voiceNoiseSuppression:
      typeof value?.voiceNoiseSuppression === 'boolean'
        ? value.voiceNoiseSuppression
        : DEFAULT_SETTINGS.voiceNoiseSuppression
  }
}
