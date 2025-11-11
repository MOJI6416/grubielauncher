import { IFriendRequest } from '@renderer/components/Friends'
import { ILocalFriend } from '@/types/ILocalFriend'
import { IServerConf } from '@/types/Server'
import { atom } from 'jotai'
import { Socket } from 'socket.io-client'
import { IAuth, ILocalAccount } from '@/types/Account'
import { TSettings } from '@/types/Settings'
import { IServer } from '@/types/ServersList'
import { Version } from '@renderer/game/Version'
import { Backend } from '@renderer/services/Backend'
import { IConsoles } from '@/types/Console'

export const pathsAtom = atom<{
  launcher: string
  minecraft: string
  java: string
}>({
  launcher: '',
  minecraft: '',
  java: ''
})

export const selectedVersionAtom = atom<Version>()
export const accountAtom = atom<ILocalAccount>()
export const authDataAtom = atom<IAuth | null>(null)

export const settingsAtom = atom<TSettings>({
  xmx: 2048,
  lang: 'en',
  devMode: false,
  downloadLimit: 6
})

export const versionsAtom = atom<Version[]>([])
export const accountsAtom = atom<ILocalAccount[]>([])
export const networkAtom = atom(false)
export const serverAtom = atom<IServerConf>()
export const versionServersAtom = atom<IServer[]>([])
export const isRunningAtom = atom(false)
export const localFriendsAtom = atom<ILocalFriend[]>([])
export const friendSocketAtom = atom<Socket>()
export const friendRequestsAtom = atom<IFriendRequest[]>([])
export const selectedFriendAtom = atom<string>()
export const isDownloadedVersionAtom = atom<boolean>(false)
export const isOwnerVersionAtom = atom<boolean>(false)
export const backendServiceAtom = atom<Backend>(new Backend())
export const consolesAtom = atom<IConsoles>({ consoles: [] })
export const onlineUsersAtom = atom<number>(-1)
export const isFriendsConnectedAtom = atom<boolean>(false)
