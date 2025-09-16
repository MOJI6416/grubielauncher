const api = window.api
const path = api.path
const fs = api.fs
const electron = window.electron

const updateActivity = api.updateActivity
const getPath = api.getPath

import { Presence } from 'discord-rpc'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Versions } from './components/Versions'
import { languages } from './components/Settings'
import { Nav } from './components/Nav'
import { useTranslation } from 'react-i18next'
import { io, Socket } from 'socket.io-client'
import { IUpdateStatus } from '../../types/IFriend'
import { Friends, IFriendRequest } from './components/Friends'
import { IUser } from '../../types/IUser'
import { IVersionStatistics } from '../../types/VersionStatistics'
import { baseUrl } from './services/Base'
import { useAtom } from 'jotai'
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  backendServiceAtom,
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
import { readNBT } from './utilities/Nbt'
import { checkDiffenceUpdateData, readVerions, syncShare } from './utilities/Versions'
import { Confirmation } from './components/Modals/Confirmation'
import { addToast } from '@heroui/toast'
import { TSettings } from '@/types/Settings'
import { IAccountConf } from '@/types/Account'
import { IServer } from '@/types/ServersList'
import { Version } from '@renderer/game/Version'
import { authElyBy, authMicrosoft } from './services/Auth'
import { NewsFeed } from './components/NewsFeed'
import { IConsole, IConsoleMessage } from '@/types/Console'
import { BlockedMods, checkBlockedMods, IBlockedMod } from './components/Modals/BlockedMods'
import { Mods } from './game/Mods'

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
  const [backendService] = useAtom(backendServiceAtom)
  const [consoles, setConsoles] = useAtom(consolesAtom)
  const [versions] = useAtom(versionsAtom)
  const setOnlineUsers = useAtom(onlineUsersAtom)[1]
  const onlineSocket = useRef<Socket | null>(null)
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom)
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([])
  const [isBlockedMods, setIsBlockedMods] = useState(false)
  const [isFriendsConnected, setIsFriendsConnected] = useAtom(isFriendsConnectedAtom)
  const setVersions = useAtom(versionsAtom)[1]

  useEffect(() => {
    if (onlineSocket.current) {
      onlineSocket.current.disconnect()
      setOnlineUsers(-1)
    }

    const socket = io(`${baseUrl}/online`)
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
    ;(async () => {
      const appData = await getPath('appData')
      if (!appData) return

      const launcherPath = path.join(appData, '.grubielauncher')
      const pathsData = {
        launcher: launcherPath,
        minecraft: path.join(launcherPath, 'minecraft'),
        java: path.join(launcherPath, 'java')
      }

      setPaths(pathsData)

      // Read settings
      await getSettings(pathsData.launcher)

      // Read accounts
      const account = await getAccounts(pathsData.launcher)

      // Read versions
      const versionsPath = path.join(pathsData.launcher, 'minecraft', 'versions')
      if (await fs.pathExists(versionsPath)) {
        const versions = await readVerions(pathsData.launcher, settings, account)
        setVersions(versions)
      } else await fs.mkdir(versionsPath, { recursive: true })
    })()
  }, [])

  const { t, i18n } = useTranslation()

  useEffect(() => {
    electron.ipcRenderer.on(
      'consoleChangeStatus',
      async (
        _event,
        versionName: string,
        instance: number,
        status: 'running' | 'stopped' | 'error'
      ) => {
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
            const statPath = path.join(version.versionPath, 'statistics.json')
            const statIsExists = fs.pathExistsSync(statPath)

            let statData: IVersionStatistics = {
              lastLaunched: new Date(),
              launches: 1,
              playTime: playTime
            }

            if (statIsExists) {
              const statData: IVersionStatistics = await fs.readJSON(statPath, 'utf-8')

              statData.lastLaunched = new Date()
              statData.launches += 1
              statData.playTime += playTime
            }

            await fs.writeJSON(statPath, statData, {
              encoding: 'utf-8',
              spaces: 2
            })
          }
        }
      }
    )

    electron.ipcRenderer.on(
      'consoleMessage',
      async (_event, versionName: string, instance: number, message: IConsoleMessage) => {
        const version = consoles.consoles.find(
          (v) => v.versionName == versionName && v.instance == instance
        )
        if (!version) return

        version.messages.push(message)
        setConsoles({ consoles: [...consoles.consoles] })
      }
    )

    electron.ipcRenderer.on(
      'consoleClear',
      async (_event, versionName: string, instance: number) => {
        const version = consoles.consoles.find(
          (v) => v.versionName == versionName && v.instance == instance
        )
        if (!version) return

        version.messages = []
        version.startTime = Date.now()
        setConsoles({ consoles: [...consoles.consoles] })
      }
    )

    async function updatePlayingTime(time: number) {
      try {
        if (!authData || !selectedAccount || !selectedAccount.accessToken) return

        const user = await backendService.getUser(authData.sub)
        if (!user) return
        await backendService.updateUser(user._id, { playTime: user.playTime + time })
      } catch (err) {
        console.log(err)
      }
    }

    electron.ipcRenderer.on('launch', () => {
      setSelectedVersion(undefined)
      setIsRunning(false)
    })

    electron.ipcRenderer.on('friendUpdate', (_event, data: IUpdateStatus) => {
      console.log(data, 'data')

      friendSocket?.emit('friendUpdate', { ...data })
    })

    return () => {
      electron.ipcRenderer.removeAllListeners('consoleMessage')
      electron.ipcRenderer.removeAllListeners('consoleClear')
      electron.ipcRenderer.removeAllListeners('launch')
      electron.ipcRenderer.removeAllListeners('friendUpdate')
      electron.ipcRenderer.removeAllListeners('consoleChangeStatus')
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
    if (friendSocket?.auth['id'] === authData.sub) return
    if (isFriendsConnected) friendSocket?.disconnect()

    const socketIo = io(`${baseUrl}/friends`, {
      auth: {
        id: authData.sub
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

        window.electron.ipcRenderer.invoke('notification', options)
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
      (data: { requestId: string; type: 'accept' | 'reject'; user: IUser }) => {
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

            window.electron.ipcRenderer.invoke('notification', options)
          } else {
            const options: Electron.NotificationConstructorOptions = {
              title: t('friends.requestDeclined'),
              body: `${user.nickname} ${'friends.declidedRequest'}`,
              icon: user.image || ''
            }

            window.electron.ipcRenderer.invoke('notification', options)
          }
        } else {
          if (type == 'accept') addToast({ color: 'success', title: t('friends.requestAccepted') })
          else addToast({ color: 'success', title: t('friends.requestDeclined') })
        }
      }
    )

    friendSocket.on('messageNotification', async (user: IUser) => {
      console.log('user', user)

      const localFriend = localFriends.find((lf) => lf.id == user._id)
      if (localFriend?.isMuted) return

      if (user._id == selectedFriend) return

      const options: Electron.NotificationConstructorOptions = {
        title: t('friends.newMessage'),
        body: `${user.nickname} ${t('friends.sentMessage')}`,
        icon: user.image || ''
      }

      window.electron.ipcRenderer.send('notify', options)
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
    const systemLocate: string = await window.electron.ipcRenderer.invoke('getLocale')
    const l = languages.find((l) => systemLocate.includes(l.code))

    const settingsConfPath = path.join(launcherPath, 'settings.json')

    let data: TSettings
    if (await fs.pathExists(settingsConfPath)) {
      data = await fs.readJSON(settingsConfPath, 'utf-8')
    } else {
      data = {
        xmx: 2048,
        lang: l?.code || i18n.language,
        devMode: false,
        downloadLimit: 6
      }

      await fs.writeJson(settingsConfPath, data, {
        encoding: 'utf-8',
        spaces: 2
      })
    }

    setSettings(data)
    i18n.changeLanguage(data.lang || l?.code || i18n.language)
  }

  async function getAccounts(launcherPath: string) {
    const accountsConfPath = path.join(launcherPath, 'accounts.json')

    if (!(await fs.pathExists(accountsConfPath))) {
      const data: IAccountConf = {
        accounts: [],
        lastPlayed: null
      }

      setAccounts(data.accounts)
      await fs.writeFile(accountsConfPath, JSON.stringify(data), 'utf-8')
      return null
    }

    const data: IAccountConf = await fs.readJSON(accountsConfPath, {
      encoding: 'utf-8'
    })

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

        updateActivity(activity)
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
          let authUser
          if (account.type == 'microsoft')
            authUser = await authMicrosoft(
              authData.auth.refreshToken,
              true,
              authData.sub,
              account.accessToken
            )
          else if (account.type == 'elyby')
            authUser = await authElyBy(
              authData.auth.refreshToken,
              true,
              authData.sub,
              selectedAccount.accessToken
            )
          else if (account.type == 'discord') {
            await backendService.getUser(authData.sub)
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

              await fs.writeJSON(
                path.join(paths.launcher, 'accounts.json'),
                { accounts: newAccounts, lastPlayed: `${account.type}_${account.nickname}` },
                { encoding: 'utf-8', spaces: 2 }
              )
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
        const serversPath = path.join(
          paths.minecraft,
          'versions',
          launchVersion.version.name,
          'servers.dat'
        )

        let servers: IServer[] = []
        if (await fs.pathExists(serversPath)) {
          servers = await readNBT(serversPath)
          setServers(servers)
        }

        const modpackData = await backendService.getModpack(launchVersion.version.shareCode)
        if (modpackData.status == 'not_found') {
          launchVersion.version.shareCode = undefined
          launchVersion.version.downloadedVersion = false
          await launchVersion.save()
        } else if (modpackData.data) {
          const diff = await checkDiffenceUpdateData({
            mods: launchVersion.version.loader.mods,
            servers,
            version: launchVersion.version,
            runArguments: launchVersion.version.runArguments || { jvm: '', game: '' },
            versionPath: launchVersion.versionPath,
            logo: launchVersion.version.image || '',
            quickServer: launchVersion.version.quickServer || ''
          })

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

        console.log(newConsole, 'newConsole')

        setConsoles({ consoles: [...consoles.consoles, newConsole] })
      }

      await launchVersion.run(account, settings, authData, _instance, quick || {})
      const activity: Presence = {
        state: `${t('rpc.playing')} ${launchVersion.version.name}`
      }

      updateActivity(activity)

      friendSocket?.emit('friendUpdate', {
        versionName: launchVersion.version.name,
        versionCode: launchVersion.version.shareCode,
        serverAddress: ''
      })

      await launchVersion.save()

      const accountsPath = path.join(paths.launcher, 'accounts.json')
      const accountsData: IAccountConf = await fs.readJSON(accountsPath, 'utf-8')

      const [lastType, lastNickname] = accountsData.lastPlayed
        ? accountsData.lastPlayed.split('_')
        : ['plain', '']

      if (lastType != account.type || lastNickname != account.nickname)
        await fs.writeJSON(
          accountsPath,
          { ...accountsData, lastPlayed: `${account.type}_${account.nickname}` },
          {
            encoding: 'utf-8',
            spaces: 2
          }
        )
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

                const version = await syncShare(selectedVersion, servers, settings.downloadLimit)
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

            const versionMods = new Mods(settings.downloadLimit, selectedVersion)
            await versionMods.check()

            setIsUpdateModal(false)
            setIsLoading(false)
            setLoadingType(undefined)

            await runGame({ skipUpdate: true })
          }}
        />
      )}
    </div>
  )
}

export default App
