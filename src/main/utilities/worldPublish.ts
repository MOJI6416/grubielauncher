import fs from 'fs-extra'
import path from 'path'
import zlib from 'zlib'
import { promisify } from 'util'
import {
  WORLD_LEVEL_FILES,
  WORLDS_ROOT,
  isPrivateWorldPath,
  isWorldLevelDataPath,
} from '@/shared/worldPrivacy'
import { isExcludedInstancePath, normalizeInstancePath } from '@/shared/instancePrivacy'
import { removeLevelDatPlayer } from './levelDat'
import { getArchiveEntryName, type ArchiveExtraEntry } from './archiver'

const gunzipAsync = promisify(zlib.gunzip)
const gzipAsync = promisify(zlib.gzip)

export function isStrippedWorldEntry(entryName: string): boolean {
  return isPrivateWorldPath(entryName) || isWorldLevelDataPath(entryName)
}

export function shouldSkipPublishEntry(entryName: string): boolean {
  return isExcludedInstancePath(entryName) || isStrippedWorldEntry(entryName)
}

export async function sanitizeLevelDat(fileData: Buffer): Promise<Buffer> {
  let payload: Buffer
  let wasGzipped = false

  try {
    payload = Buffer.from(await gunzipAsync(new Uint8Array(fileData)))
    wasGzipped = true
  } catch {
    payload = fileData
  }

  const stripped = removeLevelDatPlayer(payload)
  if (!stripped) return fileData

  if (!wasGzipped) return stripped
  return Buffer.from(await gzipAsync(new Uint8Array(stripped)))
}

async function listWorldRoots(
  sourcePath: string,
  entryName: string,
): Promise<{ directory: string; entryName: string }[]> {
  const normalized = normalizeInstancePath(entryName)

  if (normalized === WORLDS_ROOT) {
    const entries = await fs.readdir(sourcePath, { withFileTypes: true }).catch(() => [])
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        directory: path.join(sourcePath, entry.name),
        entryName: `${entryName}/${entry.name}`,
      }))
  }

  if (
    normalized.startsWith(`${WORLDS_ROOT}/`) &&
    normalized.slice(WORLDS_ROOT.length + 1).split('/').length === 1
  ) {
    return [{ directory: sourcePath, entryName }]
  }

  return []
}

export async function collectSanitizedWorldEntries(
  files: string[],
  basePath?: string,
): Promise<ArchiveExtraEntry[]> {
  const collected: ArchiveExtraEntry[] = []

  for (const file of files) {
    if (!(await fs.pathExists(file))) continue

    const entryName = getArchiveEntryName(file, basePath)
    const roots = await listWorldRoots(file, entryName)

    for (const root of roots) {
      for (const levelFile of WORLD_LEVEL_FILES) {
        const levelPath = path.join(root.directory, levelFile)
        if (!(await fs.pathExists(levelPath))) continue

        const raw = await fs.readFile(levelPath)
        collected.push({
          name: `${root.entryName}/${levelFile}`,
          data: await sanitizeLevelDat(raw),
        })
      }
    }
  }

  return collected
}
