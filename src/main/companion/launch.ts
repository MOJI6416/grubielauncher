import path from 'path'
import { COMPANION_STATS_DIR } from '@/shared/companion'
import { getLauncherPaths } from '../utilities/other'
import { companionBridge } from './bridge'
import { type CompanionConf, syncCompanionMod } from './companionMod'

export function companionStatsDir(): string {
  return path.join(getLauncherPaths().launcher, COMPANION_STATS_DIR)
}

export async function prepareCompanionLaunch(
  versionPath: string,
  conf: CompanionConf,
  versionName: string,
  instance: number
): Promise<Record<string, string>> {
  try {
    const installed = await syncCompanionMod(versionPath, conf)
    if (!installed) return {}
    return await companionBridge.register(versionName, instance, companionStatsDir())
  } catch (error) {
    console.warn('[companion] launch without the companion mod:', error)
    return {}
  }
}
