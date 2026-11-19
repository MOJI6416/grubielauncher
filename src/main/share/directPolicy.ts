import fs from 'fs-extra'
import path from 'path'
import { getDataRoot } from '../utilities/dataRoot'
import type { DirectPolicy } from './transportChoice'

let policy: DirectPolicy | null = null

function readInitialPolicy(): DirectPolicy {
  try {
    const settings = fs.readJSONSync(path.join(getDataRoot(), 'settings.json'), {
      throws: false,
    })
    return {
      directConnect: settings?.directConnect !== false,
      streamerMode: settings?.streamerMode === true,
    }
  } catch {
    return { directConnect: true, streamerMode: false }
  }
}

export function getDirectPolicy(): DirectPolicy {
  if (!policy) policy = readInitialPolicy()
  return policy
}

export function setDirectPolicy(next: DirectPolicy): void {
  policy = {
    directConnect: next.directConnect !== false,
    streamerMode: next.streamerMode === true,
  }
}
