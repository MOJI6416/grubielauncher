import { AccountType } from './Account'

export interface RpcAccountContext {
  nickname: string
  type: AccountType
}

export interface RpcRendererContext {
  account: RpcAccountContext | null
  lang: string
}
