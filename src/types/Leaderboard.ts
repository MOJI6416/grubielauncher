export interface ILeaderboardEntry {
  rank: number
  id: string
  nickname: string
  image: string | null
  headUrl: string | null
  points: number
  level: number
  achievementsCount: number
  isDonor: boolean
}

export interface IGlobalLeaderboard {
  generatedAt: string
  users: ILeaderboardEntry[]
}

export interface IOwnLeaderboardRank extends ILeaderboardEntry {
  listed: boolean
}

export interface IAchievementReachEntry {
  id: string
  points: number
  count: number
  percent: number
}

export interface IAchievementReach {
  generatedAt: string
  totalUsers: number
  achievements: IAchievementReachEntry[]
}
