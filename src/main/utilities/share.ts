import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs-extra'
import { Version } from '../game/Version'
import { projetTypeToFolder } from './modManager'
import { Backend } from '../services/Backend'
import { isPublishableContentUrl } from './trustedHosts'
import { ILocalFile, ILocalProject, ProjectType, Provider } from '@/types/ModManager'
import { IJarMod, IJarModSet } from '@/types/IVersion'
import { jarModRelativePath } from '../game/jarMods'
import { getSha1 } from './files'

function fileUrlToPath(fileUrl: string | undefined) {
  if (!fileUrl || !fileUrl.startsWith('file://')) return ''

  try {
    return fileURLToPath(fileUrl)
  } catch {
    return ''
  }
}

export function getRemoteModpackId(fileUrl: string | undefined) {
  if (!fileUrl || fileUrl.startsWith('file://') || fileUrl.startsWith('blocked::')) {
    return null
  }

  try {
    const url = new URL(fileUrl)
    const parts = url.pathname
      .split('/')
      .map((part) => {
        try {
          return decodeURIComponent(part)
        } catch {
          return part
        }
      })
      .filter(Boolean)
    const modpacksIndex = parts.indexOf('modpacks')
    if (modpacksIndex === -1) return null
    return parts[modpacksIndex + 1] || null
  } catch {
    return null
  }
}

export function shouldUploadLocalShareFile(file: ILocalFile, shareCode: string) {
  if (!file.url || file.url.startsWith('file://') || file.url.startsWith('blocked::')) {
    return true
  }

  const remoteModpackId = getRemoteModpackId(file.url)
  if (!remoteModpackId) return !isPublishableContentUrl(file.url)

  return remoteModpackId !== shareCode
}

const DISABLED_SUFFIX = '.disabled'

async function resolveLocalFilePath(
  version: Version,
  mod: ILocalProject,
  file: ILocalFile
): Promise<{ path: string; disabled: boolean } | null> {
  const instancePath = path.join(
    version.versionPath,
    mod.projectType === ProjectType.WORLD
      ? path.join('storage', 'worlds')
      : projetTypeToFolder(mod.projectType),
    file.filename
  )
  const disabledPath =
    mod.projectType === ProjectType.WORLD ? '' : `${instancePath}${DISABLED_SUFFIX}`
  const disabled =
    !!disabledPath &&
    !(await fs.pathExists(instancePath)) &&
    (await fs.pathExists(disabledPath))

  const candidates = [file.localPath || '', fileUrlToPath(file.url), instancePath].filter(
    Boolean
  )

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) return { path: candidate, disabled }
  }

  if (disabled) return { path: disabledPath, disabled }

  return null
}

export async function uploadMods(at: string, version: Version) {
  const mods = version.version.loader.mods

  const uploaded: string[] = []
  const failures: string[] = []
  let failed = false

  const backend = new Backend(at)

  if (!version.version.shareCode) {
    return {
      mods,
      success: false,
      uploaded: 0,
      failures: ['missing share code']
    }
  }

  for (const mod of mods) {
    try {
      if (!mod.version) continue

      if (mod.provider != Provider.LOCAL) continue
      if (mod.projectType === ProjectType.PLUGIN) continue
      if (!mod.version.files.length) continue

      for (const file of mod.version.files) {
        if (!shouldUploadLocalShareFile(file, version.version.shareCode)) continue

        const resolved = await resolveLocalFilePath(version, mod, file)
        if (!resolved) {
          if (/^https?:\/\//i.test(file.url || '')) continue

          failed = true
          failures.push(`${file.filename}: file not found locally`)
          continue
        }

        const url = await backend.uploadFileFromPathDirect(
          resolved.path,
          file.filename,
          `modpacks/${version.version.shareCode}/${projetTypeToFolder(mod.projectType)}`
        )
        if (!url) {
          failed = true
          failures.push(`${file.filename}: upload rejected`)
          continue
        }

        file.url = url
        delete file.localPath
        if (resolved.disabled) file.disabled = true
        uploaded.push(`${mod.id}:${file.filename}:${file.sha1}`)
      }
    } catch (err) {
      failed = true
      failures.push(`${mod.title || mod.id}: ${(err as Error)?.message || String(err)}`)
      console.error('Error uploading mod:', err)
      continue
    }
  }

  return {
    mods,
    success: !failed,
    uploaded: uploaded.length,
    failures
  }
}

export async function uploadJarMods(
  at: string,
  versionPath: string,
  shareCode: string,
  jar: IJarModSet
): Promise<IJarModSet> {
  const backend = new Backend(at)

  const upload = async (mod: IJarMod): Promise<IJarMod> => {
    if (mod.url && getRemoteModpackId(mod.url) === shareCode) return mod

    const filePath = path.join(versionPath, jarModRelativePath(mod.file))
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`${mod.name || mod.file}: file not found locally`)
    }

    const url = await backend.uploadFileFromPathDirect(
      filePath,
      mod.file,
      `modpacks/${shareCode}/jarmods`
    )
    if (!url) throw new Error(`${mod.name || mod.file}: upload rejected`)

    const stats = await fs.stat(filePath)
    return { ...mod, url, sha1: await getSha1(filePath), size: stats.size }
  }

  const mods: IJarMod[] = []
  for (const mod of jar.mods) mods.push(await upload(mod))

  return {
    mods,
    main: jar.main ? await upload(jar.main) : null,
    launch: jar.launch ?? null
  }
}
