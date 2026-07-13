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
  publishBanned?: boolean
  isDonor?: boolean
  discordId?: string | null
  socials?: {
    telegram?: string | null
    twitch?: string | null
    github?: string | null
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
  socials?: {
    telegram?: string | null
    twitch?: string | null
    github?: string | null
  }
}

export interface IFriendSettingsUpdate {
  friendRequestsEnabled?: boolean
}
