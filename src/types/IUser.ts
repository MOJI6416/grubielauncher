export interface IUser {
  _id: string
  uuid: string
  friendCode?: string
  friendRequestsEnabled?: boolean
  nickname: string
  platform: 'microsoft' | 'elyby' | 'discord'
  friends: IUser[]
  image: string | null
  headUrl?: string | null
  lastActive: Date
  createdAt: Date
  playTime: number
  achievements: string[]
  achievementPoints?: number
  publicLeaderboard?: boolean
  publicProfile?: boolean
  publishBanned?: boolean
  publishBannedAt?: Date | string | null
  publishBanReason?: string | null
  isDonor?: boolean
  discordId?: string | null
  discordUsername?: string | null
  linkedSocials?: {
    telegram?: { id: string; username: string | null } | null
  }
  notifications?: INotificationPrefs
}

export interface IMutualFriend {
  id: string
  nickname: string
  platform: IUser['platform']
  uuid: string | null
  headUrl: string | null
}

export interface IMutualFriends {
  items: IMutualFriend[]
  total: number
  limit: number
}

export interface INotificationPrefs {
  enabled: boolean
  gameInvite: boolean
  friendRequest: boolean
  worldShare: boolean
}

export interface IUpdateUser {
  nickname?: string
  lastActive?: Date
  playTime?: number
  achievements?: string[]
  publicLeaderboard?: boolean
  publicProfile?: boolean
}

export interface IFriendSettingsUpdate {
  friendRequestsEnabled?: boolean
}
