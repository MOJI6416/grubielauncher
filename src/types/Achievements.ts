export interface IAchievementStats {
  worlds: number
  playTimeTicks: number
  deaths: number
  mobKills: number
  jumps: number
  distanceCm: number
  elytraCm: number
  blocksMined: number
  diamondsMined: number
  ancientDebrisMined: number
  itemsCrafted: number
  fishCaught: number
  animalsBred: number
  itemsEnchanted: number
  villagerTrades: number
  timesSlept: number
  raidsWon: number
  enderDragonKills: number
  witherKills: number
  wardenKills: number
}

export interface IAchievementStatsResult {
  stats: IAchievementStats
  worldKeys: string[]
}

export interface IRemoteWorldStats {
  worldKey: string
  stats: IAchievementStats
}

export interface IRemoteWorldStatsResponse {
  worlds: IRemoteWorldStats[]
}

export interface IGuestWorldStatsUpload {
  worldKey: string
  players: { uuid: string; stats: IAchievementStats }[]
}

export interface IGuestStatsUploadRequest {
  worlds: IGuestWorldStatsUpload[]
}

export interface IGuestStatsUploadResponse {
  ok: boolean
  credited: number
}

export const EMPTY_ACHIEVEMENT_STATS: IAchievementStats = {
  worlds: 0,
  playTimeTicks: 0,
  deaths: 0,
  mobKills: 0,
  jumps: 0,
  distanceCm: 0,
  elytraCm: 0,
  blocksMined: 0,
  diamondsMined: 0,
  ancientDebrisMined: 0,
  itemsCrafted: 0,
  fishCaught: 0,
  animalsBred: 0,
  itemsEnchanted: 0,
  villagerTrades: 0,
  timesSlept: 0,
  raidsWon: 0,
  enderDragonKills: 0,
  witherKills: 0,
  wardenKills: 0,
}

export function addAchievementStats(
  a: IAchievementStats,
  b: IAchievementStats,
): IAchievementStats {
  const result: IAchievementStats = { ...EMPTY_ACHIEVEMENT_STATS }
  for (const key of Object.keys(result) as (keyof IAchievementStats)[]) {
    result[key] = (a?.[key] ?? 0) + (b?.[key] ?? 0)
  }
  return result
}
