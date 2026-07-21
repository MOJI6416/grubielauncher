import { ILocalFriend } from './ILocalFriend'

export type AccountType = 'microsoft' | 'plain' | 'elyby' | 'discord'

export interface IAuth extends DefaultJwtPayload {
  nickname: string
  uuid: string
  friendCode?: string
  friendRequestsEnabled?: boolean
  auth: {
    accessToken: string
    expiresAt: number
    createdAt: number
  }
}

export interface ILocalAccount {
  nickname: string
  accessToken?: string
  refreshToken?: string
  type: AccountType
  image: string
  friends: ILocalFriend[]
  id?: string
}

export interface IAccountConf {
  accounts: ILocalAccount[]
  lastPlayed: string | null
}

export interface DefaultJwtPayload {
  sub: string
  exp: number
}
