import path from 'path'
import fs from 'fs-extra'
import { type CompanionSupport, isCompanionModFile } from '@/shared/companion'
import { type CompanionPick, pickCompanionJar } from './companionManifest'
import {
  companionJarFile,
  loadCompanionManifest,
  refreshCompanionManifest,
  sha256Of
} from './companionCdn'

export interface CompanionConf {
  companionMod?: boolean
  version: { id: string }
  loader: { name: string }
}

export async function companionSupport(
  minecraft: string,
  loader: string
): Promise<CompanionSupport> {
  const pick = pickCompanionJar(await loadCompanionManifest(), minecraft, loader)
  return { supported: Boolean(pick), version: pick?.version ?? null }
}

async function wantedCompanionJar(
  conf: CompanionConf,
  refresh: boolean
): Promise<CompanionPick | null> {
  if (!conf.companionMod || conf.loader.name === 'vanilla') return null
  const manifest = await (refresh ? refreshCompanionManifest() : loadCompanionManifest())
  if (!manifest) throw new Error('The companion mod manifest is unavailable')
  return pickCompanionJar(manifest, conf.version.id, conf.loader.name)
}

async function removeOtherCompanionFiles(
  modsPath: string,
  present: string[],
  keep: string | null
): Promise<void> {
  for (const name of present) {
    if (keep && (name === keep || name === `${keep}.disabled`)) continue
    await fs.remove(path.join(modsPath, name))
  }
}

export async function syncCompanionMod(
  versionPath: string,
  conf: CompanionConf,
  options: { refresh?: boolean } = {}
): Promise<string | null> {
  const wanted = await wantedCompanionJar(conf, options.refresh === true)
  const modsPath = path.join(versionPath, 'mods')

  const names = await fs.readdir(modsPath).catch(() => [] as string[])
  const present = names.filter(isCompanionModFile)
  const keepDisabled = present.some((name) => name.toLowerCase().endsWith('.disabled'))

  if (!wanted) {
    await removeOtherCompanionFiles(modsPath, present, null)
    return null
  }

  const target = path.join(modsPath, wanted.file)
  const disabledTarget = `${target}.disabled`
  if (await fs.pathExists(disabledTarget)) {
    if ((await sha256Of(disabledTarget)) === wanted.sha256) {
      await removeOtherCompanionFiles(modsPath, present, wanted.file)
      return null
    }
  } else if ((await sha256Of(target)) === wanted.sha256) {
    await removeOtherCompanionFiles(modsPath, present, wanted.file)
    return wanted.file
  }

  const source = await companionJarFile(wanted)
  await removeOtherCompanionFiles(modsPath, present, wanted.file)
  await fs.ensureDir(modsPath)
  const destination = keepDisabled ? disabledTarget : target
  const temporary = `${destination}.${process.pid}.tmp`
  await fs.copy(source, temporary, { overwrite: true })
  if ((await sha256Of(temporary)) !== wanted.sha256) {
    await fs.remove(temporary)
    throw new Error(`Companion mod ${wanted.file} changed on disk before it reached the mods folder`)
  }
  await fs.move(temporary, destination, { overwrite: true })
  return keepDisabled ? null : wanted.file
}
