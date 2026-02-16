import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs-extra'
import { Version } from '../game/Version'
import { projetTypeToFolder } from './modManager'
import { Backend } from '../services/Backend'
import { Provider } from '@/types/ModManager'

export async function uploadMods(at: string, version: Version) {
  const mods = version.version.loader.mods

  const uploaded: string[] = []

  const backend = new Backend(at)

  for (const mod of mods) {
    try {
      if (!mod.version || uploaded.includes(mod.id)) continue

      if (mod.provider != Provider.LOCAL) continue
      if (!mod.version || !mod.version.files[0]) continue

      const file = mod.version.files[0]
      const fileUrl = file.url

      if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.startsWith('file://')) continue

      const filename = file.filename

      let modPath = ''
      try {
        modPath = fileURLToPath(fileUrl)
      } catch {
        modPath = ''
      }

      if (!modPath) {
        modPath = path.join(version.versionPath, projetTypeToFolder(mod.projectType), filename)
      }

      if (!(await fs.pathExists(modPath))) continue

      const url = await backend.uploadFileFromPath(
        modPath,
        filename,
        `modpacks/${version.version.shareCode}/${projetTypeToFolder(mod.projectType)}`
      )
      if (!url) continue

      mod.url = url
      uploaded.push(mod.id)
    } catch (err) {
      console.log('Error uploading mod:', err)
      continue
    }
  }

  return {
    mods,
    success: uploaded.length > 0
  }
}
