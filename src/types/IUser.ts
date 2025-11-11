export interface IUser {
  _id: string
  uuid: string
  nickname: string
  platform: 'microsoft' | 'elyby' | 'discord'
  friends: IUser[]
  image: string | null
  lastActive: Date
  createdAt: Date
  playTime: number
  achievements: string[]
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
}
