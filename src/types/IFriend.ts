import { IUser } from './IUser'

export interface IFriend {
  user: IUser
  isOnline: boolean
  versionName: string
  versionCode: string
  serverAddress: string
}

export interface IUpdateStatus {
  versionName?: string
  versionCode?: string | null
  serverAddress?: string | null
}
