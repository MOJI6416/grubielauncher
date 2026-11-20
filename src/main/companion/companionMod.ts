import path from 'path'
import fs from 'fs-extra'
import { createHash } from 'crypto'
import icon from '../../../resources/icon.png?asset'
import {
  type CompanionManifest,
  type CompanionManifestFile,
  type CompanionSupport,
  isCompanionModFile,
  pickCompanionFile
} from '@/shared/companion'

export interface CompanionConf {
  companionMod?: boolean
  version: { id: string }
  loader: { name: string }
}

let manifestCache: Promise<CompanionManifest | null> | null = null

export function companionResourcesDir(): string {
  return path
    .join(path.dirname(icon), 'companion')
    .replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked')
}

export function parseCompanionManifest(value: unknown): CompanionManifest | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.version !== 'string' || !Array.isArray(record.files)) return null
  const files: CompanionManifestFile[] = []
  for (const entry of record.files) {
    if (!entry || typeof entry !== 'object') continue
    const file = entry as Record<string, unknown>
    if (
      typeof file.file !== 'string' ||
      !isCompanionModFile(file.file) ||
      file.file.endsWith('.disabled') ||
      path.basename(file.file) !== file.file ||
      typeof file.loader !== 'string' ||
      !Array.isArray(file.minecraft) ||
      typeof file.sha1 !== 'string'
    ) {
      continue
    }
    files.push({
      file: file.file,
      loader: file.loader,
      minecraft: file.minecraft.filter((item): item is string => typeof item === 'string'),
      sha1: file.sha1.toLowerCase(),
      size: typeof file.size === 'number' ? file.size : 0
    })
  }
  return { version: record.version, files }
}

export function loadCompanionManifest(): Promise<CompanionManifest | null> {
  manifestCache ??= fs
    .readJson(path.join(companionResourcesDir(), 'manifest.json'))
    .then(parseCompanionManifest)
    .catch((error) => {
      console.warn('[companion] manifest is unreadable:', error)
      return null
    })
  return manifestCache
}

export async function companionSupport(
  minecraft: string,
  loader: string
): Promise<CompanionSupport> {
  const manifest = await loadCompanionManifest()
  const file = pickCompanionFile(manifest, minecraft, loader)
  return { supported: Boolean(file), version: file ? manifest?.version ?? null : null }
}

async function sha1Of(file: string): Promise<string | null> {
  try {
    return createHash('sha1').update(await fs.readFile(file)).digest('hex')
  } catch {
    return null
  }
}

export async function syncCompanionMod(
  versionPath: string,
  conf: CompanionConf
): Promise<CompanionManifestFile | null> {
  const manifest = conf.companionMod ? await loadCompanionManifest() : null
  const wanted = conf.companionMod
    ? pickCompanionFile(manifest, conf.version.id, conf.loader.name)
    : null
  const modsPath = path.join(versionPath, 'mods')

  const names = await fs.readdir(modsPath).catch(() => [] as string[])
  const present = names.filter(isCompanionModFile)
  const keepDisabled = present.some((name) => name.toLowerCase().endsWith('.disabled'))

  for (const name of present) {
    if (wanted && (name === wanted.file || name === `${wanted.file}.disabled`)) continue
    await fs.remove(path.join(modsPath, name))
  }
  if (!wanted) return null

  const target = path.join(modsPath, wanted.file)
  const disabledTarget = `${target}.disabled`
  if (await fs.pathExists(disabledTarget)) {
    if ((await sha1Of(disabledTarget)) === wanted.sha1) return null
    await fs.remove(disabledTarget)
  }
  if ((await fs.pathExists(target)) && (await sha1Of(target)) === wanted.sha1) return wanted

  const source = path.join(companionResourcesDir(), wanted.file)
  if ((await sha1Of(source)) !== wanted.sha1) {
    throw new Error(`Companion mod ${wanted.file} is missing or damaged in the launcher files`)
  }
  await fs.ensureDir(modsPath)
  const destination = keepDisabled ? disabledTarget : target
  const temporary = `${destination}.${process.pid}.tmp`
  await fs.copy(source, temporary, { overwrite: true })
  await fs.move(temporary, destination, { overwrite: true })
  return keepDisabled ? null : wanted
}
