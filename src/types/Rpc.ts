import { AccountType } from './Account'

export interface RpcAccountContext {
  nickname: string
  type: AccountType
  uuid?: string
}

export interface RpcRendererContext {
  account: RpcAccountContext | null
  lang: string
  enabled?: boolean
  hideServer: boolean
  skinVersion?: string | number
  profileUrl?: string | null
  packLinks?: RpcPackLink[]
}

export interface RpcPackLink {
  versionName: string
  url: string
}
