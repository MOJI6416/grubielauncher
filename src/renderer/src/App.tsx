const api = window.api

import { Presence } from 'discord-rpc'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Versions } from './components/Versions'
import { Nav } from './components/Nav'
import { useTranslation } from 'react-i18next'
import { io, Socket } from 'socket.io-client'
import { Friends, IFriendRequest } from './components/Friends/Friends'
import { IUser } from '../../types/IUser'
import { IVersionStatistics } from '../../types/VersionStatistics'
import { useAtom } from 'jotai'
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  consolesAtom,
  friendRequestsAtom,
  friendSocketAtom,
  isFriendsConnectedAtom,
  isOwnerVersionAtom,
  isRunningAtom,
  localFriendsAtom,
  networkAtom,
  onlineUsersAtom,
  pathsAtom,
  selectedFriendAtom,
  selectedVersionAtom,
  settingsAtom,
  versionsAtom
} from './stores/Main'
import { Confirmation } from './components/Modals/Confirmation'
import { addToast } from '@heroui/toast'
import { LANGUAGES, TSettings } from '@/types/Settings'
import { IAccountConf } from '@/types/Account'
import { IServer } from '@/types/ServersList'
import { NewsFeed } from './components/NewsFeed'
import { IConsole } from '@/types/Console'
import { BlockedMods, checkBlockedMods, IBlockedMod } from './components/Modals/BlockedMods'
import { Version } from './classes/Version'
import { checkDiffenceUpdateData, readVerions, syncShare } from './utilities/version'
import { Mods } from './classes/Mods'
import { DownloaderInfo } from '@/types/Downloader'
import { DownloadProgress } from './components/DownloadProgress'
import { BACKEND_URL } from '@/shared/config'
import { IRefreshTokenResponse } from '@/types/Auth'

export interface RunGameParams {
  skipUpdate?: boolean
  version?: Version
  instance?: number
  quick?: {
    single?: string
    multiplayer?: string
  }
}

function App() {
  const [selectedAccount, setSelectedAccount] = useAtom(accountAtom)
  const [settings, setSettings] = useAtom(settingsAtom)
  const setIsRunning = useAtom(isRunningAtom)[1]
  const [isFriends, setIsFriends] = useState(false)
  const [friendSocket, setFriendSocket] = useAtom(friendSocketAtom)
  const [friendRequests, setFriendRequests] = useAtom(friendRequestsAtom)
  const [selectedFriend] = useAtom(selectedFriendAtom)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<'update'>()
  const [localFriends, setLocalFriends] = useAtom(localFriendsAtom)
  const [paths, setPaths] = useAtom(pathsAtom)
  const [isNetwork, setIsNetwork] = useAtom(networkAtom)
  const [selectedVersion, setSelectedVersion] = useAtom(selectedVersionAtom)
  const [accounts, setAccounts] = useAtom(accountsAtom)
  const [isUpdateModal, setIsUpdateModal] = useState(false)
  const [servers, setServers] = useState<IServer[]>([])
  const [authData] = useAtom(authDataAtom)
  const [consoles, setConsoles] = useAtom(consolesAtom)
  const [versions] = useAtom(versionsAtom)
  const setOnlineUsers = useAtom(onlineUsersAtom)[1]
  const onlineSocket = useRef<Socket | null>(null)
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom)
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([])
  const [isBlockedMods, setIsBlockedMods] = useState(false)
  const [isFriendsConnected, setIsFriendsConnected] = useAtom(isFriendsConnectedAtom)
  const setVersions = useAtom(versionsAtom)[1]
  const [downloder, setDownloader] = useState<DownloaderInfo | null>(null)

  useEffect(() => {
    if (onlineSocket.current) {
      onlineSocket.current.disconnect()
      setOnlineUsers(-1)
    }

    const socket = io(`${BACKEND_URL}/online`)

    onlineSocket.current = socket

    return () => {
      socket.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!onlineSocket.current) return

    onlineSocket.current.on('onlineCount', (count: number) => {
      console.log('Online users count:', count)

      setOnlineUsers(count)
      setIsNetwork(count > 0)
    })

    onlineSocket.current.on('disconnect', () => {
      setOnlineUsers(-1)
      setIsNetwork(false)
    })

    return () => {
      onlineSocket.current?.off('onlineCount')
    }
  }, [onlineSocket])

  // Initial setup
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const paths = await api.other.getPaths()
        if (cancelled) return

        setPaths(paths)

        const settings = await getSettings(paths.launcher)
        if (cancelled) return

        const account = await getAccounts(paths.launcher)
        if (cancelled) return

        const versionsPath = await api.path.join(paths.minecraft, 'versions')

        if (await api.fs.pathExists(versionsPath)) {
          const versions = await readVerions(paths.launcher, settings, account)
          if (!cancelled) setVersions(versions)
        } else {
          await api.fs.ensure(versionsPath)
        }
      } catch (err) {
        console.error('Init error:', err)
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [])

  const { t, i18n } = useTranslation()

  useEffect(() => {
    api.events.onConsoleChangeStatus(async (versionName, instance, status) => {
      const versionConsole = consoles.consoles.find(
        (v) => v.versionName == versionName && v.instance == instance
      )
      const version = versions.find((v) => v.version.name == versionName)
      if (!versionConsole || !version) return

      versionConsole.status = status
      setConsoles({ consoles: [...consoles.consoles] })

      if (status == 'stopped') {
        const time = Date.now() - versionConsole.startTime
        const playTime = Math.floor(time / 1000)

        await updatePlayingTime(playTime)

        if (isOwnerVersion) {
          const statPath = await window.api.path.join(version.versionPath, 'statistics.json')
          const statIsExists = await window.api.fs.pathExists(statPath)

          let statData: IVersionStatistics = {
            lastLaunched: new Date(),
            launches: 1,
            playTime: playTime
          }

          if (statIsExists) {
            const statData: IVersionStatistics = await window.api.fs.readJSON(statPath, 'utf-8')

            statData.lastLaunched = new Date()
            statData.launches += 1
            statData.playTime += playTime
          }

          await window.api.fs.writeJSON(statPath, statData)
        }
      }
    })

    api.events.onConsoleMessage(async (versionName, instance, message) => {
      const version = consoles.consoles.find(
        (v) => v.versionName == versionName && v.instance == instance
      )
      if (!version) return

      version.messages.push(message)
      setConsoles({ consoles: [...consoles.consoles] })
    })

    api.events.onConsoleClear(async (versionName, instance) => {
      const version = consoles.consoles.find(
        (v) => v.versionName == versionName && v.instance == instance
      )
      if (!version) return

      version.messages = []
      version.startTime = Date.now()
      setConsoles({ consoles: [...consoles.consoles] })
    })

    async function updatePlayingTime(time: number) {
      try {
        if (!authData || !selectedAccount || !selectedAccount.accessToken) return

        const user = await window.api.backend.getUser(
          selectedAccount?.accessToken || '',
          authData.sub
        )
        if (!user) return
        await window.api.backend.updateUser(selectedAccount?.accessToken || '', user._id, {
          playTime: user.playTime + time
        })
      } catch (err) {
        console.log(err)
      }
    }

    api.events.onLaunch(() => {
      setSelectedVersion(undefined)
      setIsRunning(false)
    })

    api.events.onFriendUpdate((data) => {
      console.log(data, 'data')
      friendSocket?.emit('friendUpdate', { ...data })
    })

    api.events.onDownloaderInfo((info) => {
      setDownloader(info)
    })

    return () => {
      api.events.removeAllListeners('consoleMessage')
      api.events.removeAllListeners('consoleClear')
      api.events.removeAllListeners('launch')
      api.events.removeAllListeners('friendUpdate')
      api.events.removeAllListeners('consoleChangeStatus')
      api.events.removeAllListeners('consolePublicAddress')
    }
  }, [friendSocket, consoles])

  useEffect(() => {
    setIsFriends(false)
    if (!authData) {
      setFriendSocket(undefined)
      setIsFriendsConnected(false)
      friendSocket?.disconnect()
      return
    }
    if (friendSocket?.auth['token'] === selectedAccount?.accessToken) return
    if (isFriendsConnected) friendSocket?.disconnect()

    const socketIo = io(`${BACKEND_URL}/friends`, {
      auth: {
        token: selectedAccount?.accessToken
      }
    })

    setFriendSocket(socketIo)
    setLocalFriends(selectedAccount?.friends || [])

    return () => {
      socketIo.disconnect()
      setIsFriendsConnected(false)
      setFriendSocket(undefined)
    }
  }, [authData?.sub])

  useEffect(() => {
    if (!friendSocket) return

    friendSocket.on('friendRequest', async (data: IFriendRequest) => {
      setFriendRequests((prev) => [...prev, data])

      if (data.type == 'recipient') {
        const options: Electron.NotificationConstructorOptions = {
          title: t('friends.newRequest'),
          body: `${data.user.nickname} ${t('friends.sentRequest')}`,
          icon: data.user.image || ''
        }

        await api.other.notify(options)
      }

      if (data.type == 'requester') {
        addToast({
          title: t('friends.requestSent'),
          color: 'success'
        })
      }
    })

    friendSocket.on(
      'friendRequestRemove',
      async (data: { requestId: string; type: 'accept' | 'reject'; user: IUser }) => {
        const { requestId, type, user } = data

        const fr = friendRequests.find((fr) => fr.requestId == requestId)
        if (fr) setFriendRequests((prev) => prev.filter((r) => r.requestId != requestId))

        if (user._id != authData?.sub) {
          if (type == 'accept') {
            const options: Electron.NotificationConstructorOptions = {
              title: t('friends.requestAccepted'),
              body: `${user.nickname} ${t('friends.acceptedRequest')}`,
              icon: user.image || ''
            }

            await api.other.notify(options)
          } else {
            const options: Electron.NotificationConstructorOptions = {
              title: t('friends.requestDeclined'),
              body: `${user.nickname} ${'friends.declidedRequest'}`,
              icon: user.image || ''
            }

            await api.other.notify(options)
          }
        } else {
          if (type == 'accept') addToast({ color: 'success', title: t('friends.requestAccepted') })
          else addToast({ color: 'success', title: t('friends.requestDeclined') })
        }
      }
    )

    friendSocket.on('messageNotification', async (user: IUser) => {
      const localFriend = localFriends.find((lf) => lf.id == user._id)
      if (localFriend?.isMuted) return

      if (user._id == selectedFriend) return

      const options: Electron.NotificationConstructorOptions = {
        title: t('friends.newMessage'),
        body: `${user.nickname} ${t('friends.sentMessage')}`,
        icon: user.image || ''
      }

      await api.other.notify(options)
      addToast({
        title: t('friends.newMessage'),
        description: `${user.nickname} ${t('friends.sentMessage')}`
      })
    })

    friendSocket.on('connect', () => {
      setFriendSocket(friendSocket)
      setIsFriendsConnected(friendSocket.connected)
    })

    friendSocket.on('disconnect', () => {
      setFriendSocket(undefined)
      setIsFriends(false)
      setIsFriendsConnected(false)
    })

    return () => {
      friendSocket.off('friendRequest')
      friendSocket.off('messageNotification')
      friendSocket.off('friendRequestRemove')
      friendSocket.off('disconnect')
      friendSocket.off('connect')
    }
  }, [friendSocket, selectedFriend, friendRequests])

  async function getSettings(launcherPath: string) {
    const systemLocate: string = await api.other.getLocale()
    const l = LANGUAGES.find((l) => systemLocate.includes(l.code))

    const settingsConfPath = await api.path.join(launcherPath, 'settings.json')

    let data: TSettings
    if (await api.fs.pathExists(settingsConfPath)) {
      data = await api.fs.readJSON(settingsConfPath, 'utf-8')
    } else {
      data = {
        xmx: 2048,
        lang: l?.code || i18n.language,
        devMode: false,
        downloadLimit: 6
      }

      await api.fs.writeJSON(settingsConfPath, data)
    }

    setSettings(data)
    i18n.changeLanguage(data.lang || l?.code || i18n.language)
    return data
  }

  async function getAccounts(launcherPath: string) {
    const accountsConfPath = await api.path.join(launcherPath, 'accounts.json')

    if (!(await api.fs.pathExists(accountsConfPath))) {
      const data: IAccountConf = {
        accounts: [],
        lastPlayed: null
      }

      setAccounts(data.accounts)
      await api.fs.writeFile(accountsConfPath, JSON.stringify(data), 'utf-8')
      return null
    }

    const data: IAccountConf = await api.fs.readJSON(accountsConfPath, 'utf-8')

    setAccounts(data.accounts)

    let selectedAccount = data.accounts[0]
    if (data.lastPlayed) {
      const lastPlayed = data.accounts.find((a) => `${a.type}_${a.nickname}` == data.lastPlayed)
      setSelectedAccount(lastPlayed)

      if (lastPlayed) {
        selectedAccount = lastPlayed

        const activity: Presence = {
          smallImageKey: 'steve',
          smallImageText: lastPlayed.nickname
        }

        await api.rpc.updateActivity(activity)
      }
    }

    return selectedAccount
  }

  const runGame = useCallback(
    async (params: RunGameParams) => await run({ ...params }),
    [selectedVersion, selectedAccount, settings, consoles]
  )

  async function run({
    skipUpdate,
    version,
    instance,
    quick
  }: {
    skipUpdate?: boolean
    version?: Version
    instance?: number
    quick?: {
      single?: string
      multiplayer?: string
    }
  }) {
    const launchVersion = version || selectedVersion
    if (!launchVersion) {
      addToast({
        title: t('app.startupError'),
        color: 'danger'
      })
      return
    }

    setIsRunning(true)

    let _instance = instance || 0
    if (instance === undefined) {
      const versionConsole = consoles.consoles
        .reverse()
        .find((c) => c.versionName == launchVersion.version.name && c.status == 'running')

      if (versionConsole) {
        _instance = versionConsole.instance + 1
      } else {
        _instance = 0
      }
    }

    try {
      if (!selectedAccount || !settings || !launchVersion) return

      let account = selectedAccount

      if (authData) {
        const { expiresAt } = authData.auth

        if (
          (account.type != 'discord' && Date.now() > expiresAt) ||
          (account.type == 'discord' && Date.now() / 1000 > authData.exp)
        ) {
          let authUser: IRefreshTokenResponse | null = null
          if (account.type == 'microsoft')
            authUser = await api.auth.microsoftRefresh(authData.auth.refreshToken, authData.sub)
          else if (account.type == 'elyby')
            authUser = await api.auth.elybyRefresh(authData.auth.refreshToken, authData.sub)
          else if (account.type == 'discord') {
            await api.backend.getUser(selectedAccount?.accessToken || '', authData.sub)
          }

          if (authUser && account.type !== 'discord') {
            const index = accounts.findIndex(
              (a) => a.type === account.type && a.nickname === account.nickname
            )

            if (index !== -1) {
              account = { ...account, ...authUser }
              const newAccounts = [...accounts]
              newAccounts[index] = account

              setAccounts(newAccounts)
              setSelectedAccount(account)

              await api.fs.writeJSON(await api.path.join(paths.launcher, 'accounts.json'), {
                accounts: newAccounts,
                lastPlayed: `${account.type}_${account.nickname}`
              })
            }
          }
        }
      }

      if (
        !skipUpdate &&
        launchVersion.version.shareCode &&
        launchVersion.version.downloadedVersion &&
        isNetwork
      ) {
        const serversPath = await api.path.join(
          paths.minecraft,
          'versions',
          launchVersion.version.name,
          'servers.dat'
        )

        let servers: IServer[] = []
        if (await api.fs.pathExists(serversPath)) {
          servers = await api.servers.read(serversPath)
          setServers(servers)
        }

        const modpackData = await api.backend.getModpack(
          selectedAccount.accessToken || '',
          launchVersion.version.shareCode
        )
        if (modpackData.status == 'not_found') {
          launchVersion.version.shareCode = undefined
          launchVersion.version.downloadedVersion = false
          await launchVersion.save()
        } else if (modpackData.data) {
          const diff = await checkDiffenceUpdateData(
            {
              mods: launchVersion.version.loader.mods,
              servers,
              version: launchVersion.version,
              runArguments: launchVersion.version.runArguments || { jvm: '', game: '' },
              versionPath: launchVersion.versionPath,
              logo: launchVersion.version.image || '',
              quickServer: launchVersion.version.quickServer || ''
            },
            selectedAccount.accessToken || ''
          )

          if (diff) return setIsUpdateModal(true)
        }
      }

      launchVersion.version.lastLaunch = new Date()

      addToast({
        title: t('app.starting')
      })

      const versionConsole = consoles.consoles.find(
        (c) => c.versionName == launchVersion.version.name && c.instance == _instance
      )

      if (versionConsole) {
        versionConsole.status = 'running'
        versionConsole.startTime = Date.now()
        versionConsole.messages = []

        setConsoles({ consoles: [...consoles.consoles] })
      } else {
        const newConsole: IConsole = {
          versionName: launchVersion.version.name || '',
          status: 'running',
          instance: _instance,
          startTime: Date.now(),
          messages: []
        }

        setConsoles({ consoles: [...consoles.consoles, newConsole] })
      }

      await launchVersion.run(account, authData, _instance, quick)
      const activity: Presence = {
        state: `${t('rpc.playing')} ${launchVersion.version.name}`
      }

      await api.rpc.updateActivity(activity)

      friendSocket?.emit('friendUpdate', {
        versionName: launchVersion.version.name,
        versionCode: launchVersion.version.shareCode,
        serverAddress: ''
      })

      await launchVersion.save()

      const accountsPath = await api.path.join(paths.launcher, 'accounts.json')
      const accountsData: IAccountConf = await api.fs.readJSON(accountsPath, 'utf-8')

      const [lastType, lastNickname] = accountsData.lastPlayed
        ? accountsData.lastPlayed.split('_')
        : ['plain', '']

      if (lastType != account.type || lastNickname != account.nickname)
        await api.fs.writeJSON(accountsPath, {
          ...accountsData,
          lastPlayed: `${account.type}_${account.nickname}`
        })
    } catch (err) {
      console.log(err)

      addToast({
        title: t('app.startupError'),
        color: 'danger'
      })
      setSelectedVersion(undefined)
      setIsRunning(false)
    }
  }

  return (
    <div className="h-screen w-full flex flex-col">
      <>
        <Nav runGame={runGame} setIsFriends={setIsFriends} />

        <div className="flex-1 overflow-y-auto px-4 py-2 min-h-0">
          <div className="flex space-x-4 h-full">
            <Versions runGame={runGame} />
            {isFriends && <Friends runGame={runGame} />}
          </div>
        </div>

        <NewsFeed />

        {isUpdateModal && (
          <Confirmation
            onClose={() => {
              if (isLoading) return
              setIsUpdateModal(false)
              setIsRunning(false)
            }}
            title={t('versions.updateAvailable')}
            content={[
              {
                color: 'warning',
                text: t('versions.hostChanged')
              }
            ]}
            buttons={[
              {
                text: t('common.update'),
                color: 'success',
                loading: isLoading && loadingType == 'update',
                onClick: async () => {
                  if (!selectedVersion) return

                  setLoadingType('update')
                  setIsLoading(true)

                  const version = await syncShare(
                    selectedVersion,
                    servers,
                    settings,
                    selectedAccount?.accessToken || ''
                  )
                  setSelectedVersion(version)

                  const blockedMods: IBlockedMod[] = await checkBlockedMods(
                    version.version.loader.mods
                  )

                  if (blockedMods.length > 0) {
                    setBlockedMods(blockedMods)
                    setIsBlockedMods(true)
                    return
                  }

                  setIsUpdateModal(false)
                  setIsLoading(false)
                  setLoadingType(undefined)

                  await runGame({ skipUpdate: true })
                }
              },
              {
                text: t('versions.runWithoutUpdating'),
                onClick: async () => {
                  setIsUpdateModal(false)
                  await runGame({ skipUpdate: true })
                }
              }
            ]}
          />
        )}

        {isBlockedMods && blockedMods.length && (
          <BlockedMods
            mods={blockedMods}
            onClose={async (bMods) => {
              setIsBlockedMods(false)

              if (!selectedVersion) return

              for (const bMod of bMods) {
                if (!bMod.filePath) continue

                const mod = selectedVersion.version.loader.mods.find((m) => m.id == bMod.projectId)
                if (!mod || !mod.version) continue

                mod.version.files[0].localPath = bMod.filePath
              }

              const versionMods = new Mods(settings, selectedVersion.version)
              await versionMods.check()

              setIsUpdateModal(false)
              setIsLoading(false)
              setLoadingType(undefined)

              await runGame({ skipUpdate: true })
            }}
          />
        )}

        {downloder && <DownloadProgress info={downloder} />}
      </>
    </div>
  )
}

export default App
