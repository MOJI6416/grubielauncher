export interface IUser {
  _id: string
  uuid: string
  friendCode?: string
  friendRequestsEnabled?: boolean
  nickname: string
  platform: 'microsoft' | 'elyby' | 'discord'
  friends: IUser[]
  image: string | null
  lastActive: Date
  createdAt: Date
  playTime: number
  achievements: string[]
  publicLeaderboard?: boolean
  publicProfile?: boolean
  publishBanned?: boolean
  isDonor?: boolean
  discordId?: string | null
  discordUsername?: string | null
  linkedSocials?: {
    telegram?: { id: string; username: string | null } | null
    twitch?: { id: string; login: string } | null
    github?: { id: string; login: string } | null
  }
}

export interface ICreateUser {
  uuid: string
  nickname: string
  platform: 'microsoft' | 'elyby' | 'discord'
  image?: string
}

export interface IUpdateUser {
  nickname?: string
  image?: string
  lastActive?: Date
  playTime?: number
  achievements?: string[]
  publicLeaderboard?: boolean
  publicProfile?: boolean
}

export interface IFriendSettingsUpdate {
  friendRequestsEnabled?: boolean
}
