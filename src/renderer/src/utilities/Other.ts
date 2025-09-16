import { ILocalAccount } from '@/types/Account'
import { IVersionManifest } from '@/types/IVersionManifest'

export function getOS() {
  const os = window.electron.process.platform
  switch (os) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'osx'
    case 'linux':
      return 'linux'
    default:
      return ''
  }
}

export function formatTime(
  seconds: number,
  t: {
    h: string
    m: string
    s: string
  }
): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const parts: string[] = []
  if (hrs > 0) parts.push(`${hrs}${t.h}`)
  if (mins > 0) parts.push(`${mins}${t.m}`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs.toFixed(0)}${t.s}`)

  return parts.join(' ')
}

export function currentTime() {
  const currentDate = new Date()

  const hours = currentDate.getHours().toString().padStart(2, '0')
  const minutes = currentDate.getMinutes().toString().padStart(2, '0')
  const seconds = currentDate.getSeconds().toString().padStart(2, '0')

  return `${hours}:${minutes}:${seconds}`
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M'
  } else if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K'
  } else {
    return num.toString()
  }
}

export const forbiddenSymbols: string[] = ['\\', '/', ':', '*', '?', '"', '<', '>', '|']

export function replaceForbiddenSymbols(str: string): string {
  return forbiddenSymbols.reduce((acc, symbol) => acc.replaceAll(symbol, ''), str)
}

export function formatDate(date: Date) {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${day}.${month}.${year} ${hours}:${minutes}`
}

export function convertMavenCoordinateToJarPath(coordinate: string): string {
  const parts = coordinate.split(':')

  if (parts.length !== 3) {
    return ''
  }

  const groupId = parts[0].replace(/\./g, '/')
  const artifactId = parts[1]
  const version = parts[2]

  return `${groupId}/${artifactId}/${version}/${artifactId}-${version}.jar`
}

export function removeDuplicatesLibraries(
  items: IVersionManifest['libraries']
): IVersionManifest['libraries'] {
  const uniqueNames = new Set<string>()
  return items.filter((item) => {
    if (item.natives) return true

    item.name = item.name.replace('@jar', '')

    if (uniqueNames.has(item.name)) {
      return false
    }
    uniqueNames.add(item.name)
    return true
  })
}

export function isOwner(owner?: string, account?: ILocalAccount) {
  if (!owner || !account) return false

  return `${account.type}_${account.nickname}` === owner
}

export function getFullLangCode(lang: { code: string; country: string }): string {
  return `${lang.code}_${lang.country.toLowerCase()}`
}

export function getJavaAgent(
  accountType: 'elyby' | 'discord',
  authinjPath: string,
  isQuotes = false
): string {
  let authServer = ''
  switch (accountType) {
    case 'elyby':
      authServer = `ely.by`
      break
    case 'discord':
      authServer = `grubielauncher.com`
      break
  }

  if (isQuotes) {
    authinjPath = `"${authinjPath}"`
  }
  return `-javaagent:${authinjPath}=${authServer}`
}

export function toUUID(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
