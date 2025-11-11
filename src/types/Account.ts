import { ILocalFriend } from './ILocalFriend'

export type AccountType = 'microsoft' | 'plain' | 'elyby' | 'discord'

export interface IAuth extends DefaultJwtPayload {
  nickname: string
  uuid: string
  auth: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    createdAt: number
  }
}

export interface ILocalAccount {
  nickname: string
  accessToken?: string
  type: AccountType
  image: string
  friends: ILocalFriend[]
}

export interface IAccountConf {
  accounts: ILocalAccount[]
  lastPlayed: string | null
}

export interface DefaultJwtPayload {
  sub: string
  exp: number
}
