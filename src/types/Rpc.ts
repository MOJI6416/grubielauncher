import { AccountType } from './Account'

export interface RpcAccountContext {
  nickname: string
  type: AccountType
  uuid?: string
}

export interface RpcRendererContext {
  account: RpcAccountContext | null
  lang: string
  hideServer: boolean
  skinVersion?: string | number
}
