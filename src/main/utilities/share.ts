import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs-extra'
import { Version } from '../game/Version'
import { projetTypeToFolder } from './modManager'
import { Backend } from '../services/Backend'
import { ILocalFile, ILocalProject, ProjectType, Provider } from '@/types/ModManager'

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
  if (!remoteModpackId) return false

  return remoteModpackId !== shareCode
}

async function resolveLocalFilePath(version: Version, mod: ILocalProject, file: ILocalFile) {
  const candidates = [
    file.localPath || '',
    fileUrlToPath(file.url),
    path.join(
      version.versionPath,
      mod.projectType === ProjectType.WORLD
        ? path.join('storage', 'worlds')
        : projetTypeToFolder(mod.projectType),
      file.filename
    )
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) return candidate
  }

  return ''
}

export async function uploadMods(at: string, version: Version) {
  const mods = version.version.loader.mods

  const uploaded: string[] = []
  let failed = false

  const backend = new Backend(at)

  if (!version.version.shareCode) {
    return {
      mods,
      success: false,
      uploaded: 0
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

        const modPath = await resolveLocalFilePath(version, mod, file)
        if (!modPath) {
          failed = true
          continue
        }

        const url = await backend.uploadFileFromPathDirect(
          modPath,
          file.filename,
          `modpacks/${version.version.shareCode}/${projetTypeToFolder(mod.projectType)}`
        )
        if (!url) {
          failed = true
          continue
        }

        file.url = url
        delete file.localPath
        uploaded.push(`${mod.id}:${file.filename}:${file.sha1}`)
      }
    } catch (err) {
      failed = true
      console.error('Error uploading mod:', err)
      continue
    }
  }

  return {
    mods,
    success: !failed,
    uploaded: uploaded.length
  }
}
