import { useEffect, useState } from 'react'

const api = window.api
const path = api.path
const fs = api.fs
const updateActivity = api.updateActivity
const startOAuthServer = api.startOAuthServer
const shell = api.shell
const env = api.env

import { FaDiscord, FaMicrosoft } from 'react-icons/fa'

import { useTranslation } from 'react-i18next'
import { CircleAlert, User, UserMinus, UserPlus, X } from 'lucide-react'
import { TbSquareLetterE } from 'react-icons/tb'
import { Presence } from 'discord-rpc'
import AccountInfo from './Account/AccountInfo'
import { IUser } from '@/types/IUser'
import { useAtom } from 'jotai'
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  backendServiceAtom,
  consolesAtom,
  isRunningAtom,
  networkAtom,
  pathsAtom
} from '@renderer/stores/Main'
import {
  addToast,
  Alert,
  Avatar,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Select,
  SelectItem,
  Spinner
} from '@heroui/react'
import { IAuth, ILocalAccount } from '@/types/Account'
import { authDiscord, authElyBy, authMicrosoft } from '@renderer/services/Auth'
import { jwtDecode } from 'jwt-decode'
import { Backend } from '@renderer/services/Backend'

export function Accounts() {
  const [modalSelectIsOpen, setIsOpenModalSelect] = useState(false)
  const [modalAddIsOpen, setIsOpenModalAdd] = useState(false)
  const [paths] = useAtom(pathsAtom)
  const [nickname, setNickname] = useState('')
  const [isPlain, setIsPlain] = useState(false)
  const [isSigning, setIsSigning] = useState(false)
  const [signType, setSignType] = useState<'microsoft' | 'elyby' | 'discord'>()
  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<'avatar' | 'skin' | 'user'>()
  const [accountInfo, setAccountInfo] = useState(false)
  const [user, setUser] = useState<IUser | undefined>()
  const [selectedAccount, setSelectedAccount] = useAtom(accountAtom)
  const [accounts, setAccounts] = useAtom(accountsAtom)
  const { t } = useTranslation()
  const [isNetwork] = useAtom(networkAtom)
  const [isRunning] = useAtom(isRunningAtom)
  const [authData, setAuthData] = useAtom(authDataAtom)
  const [backendService, setBackendService] = useAtom(backendServiceAtom)
  const [consoles] = useAtom(consolesAtom)

  async function oauth(provider: 'microsoft' | 'elyby' | 'discord', code: string) {
    try {
      if (!paths.launcher) return

      let authUser

      if (provider == 'microsoft') authUser = await authMicrosoft(code)
      else if (provider == 'elyby') authUser = await authElyBy(code)
      else if (provider == 'discord') authUser = await authDiscord(code)

      if (!authUser) throw new Error()

      if (accounts?.find((a) => a.nickname == authUser.nickname && a.type == provider)) {
        setIsSigning(false)
        setSignType(undefined)
        addToast({
          color: 'warning',
          title: t('accounts.exists')
        })

        return
      }

      const account: ILocalAccount = {
        ...authUser,
        type: provider
      }

      setAccounts([...accounts, account])

      const accountsConfPath = path.join(paths.launcher, 'accounts.json')

      await fs.writeJSON(
        accountsConfPath,
        {
          accounts: [...accounts, account],
          lastPlayed: `${account.type}_${account.nickname}`
        },
        {
          encoding: 'utf-8',
          spaces: 2
        }
      )

      setSelectedAccount(account)

      closeModalSelect()
      closeModalAdd()

      setIsSigning(false)
      setSignType(undefined)

      addToast({
        color: 'success',
        title: t('accounts.added')
      })
    } catch (err) {
      setIsSigning(false)
      setSignType(undefined)
      addToast({
        color: 'danger',
        title: t('accounts.failedLogIn')
      })
    }
  }

  useEffect(() => {
    if (!selectedAccount || !selectedAccount?.accessToken) {
      setAuthData(null)
      setBackendService(new Backend())
      return
    }

    try {
      const decode = jwtDecode<IAuth>(selectedAccount.accessToken)
      setAuthData(decode)
      setBackendService(new Backend(selectedAccount.accessToken))
    } catch {
      setAuthData(null)
    }
  }, [selectedAccount])

  async function addPlainAccount() {
    const accountsConfPath = path.join(paths.launcher, 'accounts.json')

    const account: ILocalAccount = {
      nickname,
      type: 'plain',
      image: '',
      friends: []
    }

    setAccounts([...accounts, account])

    await fs.writeJSON(
      accountsConfPath,
      {
        accounts: [...accounts, account],
        lastPlayed: `${account.type}_${account.nickname}`
      },
      {
        encoding: 'utf-8',
        spaces: 2
      }
    )

    setSelectedAccount(account)
    closeModalSelect()
    closeModalAdd()
    addToast({
      color: 'success',
      title: t('accounts.added')
    })
  }

  function closeModalSelect() {
    setIsOpenModalSelect(false)
  }

  function openModalSelect() {
    setIsOpenModalSelect(true)
  }

  function closeModalAdd() {
    setNickname('')
    setIsOpenModalAdd(false)
  }

  function openModalAdd() {
    setIsSigning(false)
    setIsPlain(false)
    setIsOpenModalAdd(true)
  }

  async function selectAccount(value: string) {
    if (!accounts) return

    const account = accounts.find((a) => `${a.type}_${a.nickname}` == value)
    if (!account) return

    setSelectedAccount(account)

    const activity: Presence = {
      smallImageKey: 'steve',
      smallImageText: account.nickname
    }

    updateActivity(activity)

    await fs.writeJSON(
      path.join(paths.launcher, 'accounts.json'),
      {
        accounts,
        lastPlayed: `${account.type}_${account.nickname}`
      },
      {
        encoding: 'utf-8',
        spaces: 2
      }
    )
  }

  async function deleteAccount() {
    if (!accounts || !selectedAccount) return

    const accountsConfPath = path.join(paths.launcher, 'accounts.json')

    const indexToRemove = accounts.indexOf(selectedAccount)
    if (indexToRemove !== -1) {
      accounts.splice(indexToRemove, 1)
    }

    setSelectedAccount(undefined)
    setAccounts(accounts)
    await fs.writeJSON(
      accountsConfPath,
      {
        accounts: accounts,
        lastPlayed: null
      },
      {
        encoding: 'utf-8',
        spaces: 2
      }
    )

    addToast({
      color: 'success',
      title: t('accounts.deleted')
    })
  }

  async function Auth(type: 'microsoft' | 'elyby' | 'discord') {
    setIsPlain(false)

    let authUrl
    if (type == 'microsoft')
      authUrl = `https://login.live.com/oauth20_authorize.srf?client_id=${env.MICROSOFT_CLIENT_ID}&response_type=code&redirect_uri=http://localhost:53213/callback&scope=XboxLive.signin%20offline_access&state=microsoft`
    else if (type == 'elyby')
      authUrl = `https://account.ely.by/oauth2/v1?client_id=${env.ELYBY_CLIENT_ID}&redirect_uri=http://localhost:53213/callback&response_type=code&scope=offline_access,account_info,minecraft_server_session&state=elyby`
    else if (type == 'discord')
      authUrl = `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A53213%2Fcallback&scope=identify+guilds.join&state=discord`

    shell.openExternal(authUrl)
    setSignType(type)
    setIsSigning(true)

    const { provider, code } = await startOAuthServer()

    await oauth(provider, code)
  }

  return (
    <>
      <div className="flex space-x-4 items-center min-w-0">
        {selectedAccount ? (
          <>
            <div
              className={`flex items-center space-x-2 min-w-0 ${selectedAccount.type != 'plain' && isNetwork ? 'cursor-pointer' : ''}`}
              onClick={async () => {
                if (
                  isLoading ||
                  selectedAccount.type == 'plain' ||
                  !isNetwork ||
                  !authData ||
                  !selectedAccount.accessToken
                )
                  return

                setIsLoading(true)
                setLoadingType('user')

                try {
                  const user = await backendService.getUser(authData.sub)

                  if (user) {
                    setUser(user)
                    setAccountInfo(true)
                    return
                  }

                  throw new Error()
                } catch (err) {
                  addToast({
                    color: 'danger',
                    title: t('accountInfo.error')
                  })
                } finally {
                  setIsLoading(false)
                  setLoadingType(undefined)
                }
              }}
            >
              <Avatar
                className="flex-shrink-0"
                src={selectedAccount.image}
                name={selectedAccount.nickname}
              />

              <p className="text-xl font-semibold truncate flex-grow">{selectedAccount.nickname}</p>
              {isLoading && loadingType == 'user' && <Spinner size="sm" />}
            </div>
            <Button
              variant="flat"
              isDisabled={isRunning}
              startContent={<User className="flex-shrink-0" size={22} />}
              onPress={openModalSelect}
            >
              {t('accounts.accounts')}
            </Button>
          </>
        ) : (
          <>
            <Alert color="warning" title={t('accounts.notSelected')} />
            <div>
              <Button
                variant="flat"
                className="animate-pulse"
                startContent={<User size={22} />}
                onPress={accounts?.length != 0 ? openModalSelect : openModalAdd}
              >
                {t('accounts.select')}
              </Button>
            </div>
          </>
        )}
      </div>

      <Modal isOpen={modalSelectIsOpen} onClose={closeModalSelect} size="sm">
        <ModalContent>
          <ModalHeader>{t('accounts.accountSelection')}</ModalHeader>

          <ModalBody>
            <div className="flex flex-col space-y-4">
              <Select
                placeholder={t('accounts.selectAccount')}
                isDisabled={accounts?.length == 0}
                selectedKeys={[`${selectedAccount?.type}_${selectedAccount?.nickname}`]}
                renderValue={(acounts) => {
                  return acounts.map((option) => {
                    const account = accounts?.find((a) => `${a.type}_${a.nickname}` == option.key)
                    if (!account) return <p>Undefined user</p>

                    return (
                      <div className="flex space-x-1 items-center">
                        <Avatar src={account.image} size="sm" name={account.nickname} />

                        <p>{account.nickname}</p>
                        {account.type == 'microsoft' ? (
                          <FaMicrosoft size={22} />
                        ) : account.type == 'elyby' ? (
                          <TbSquareLetterE size={22} />
                        ) : account.type == 'discord' ? (
                          <FaDiscord size={22} />
                        ) : (
                          <User size={22} />
                        )}
                      </div>
                    )
                  })
                }}
                onChange={async (event) => {
                  const value = event.target.value
                  if (!value) return
                  await selectAccount(value)
                }}
              >
                {accounts.map((account) => (
                  <SelectItem key={`${account.type}_${account.nickname}`}>
                    <div className="flex space-x-1 items-center">
                      <Avatar src={account.image} size="sm" name={account.nickname} />

                      <p>{account.nickname}</p>
                      {account.type == 'microsoft' ? (
                        <FaMicrosoft size={22} />
                      ) : account.type == 'elyby' ? (
                        <TbSquareLetterE size={22} />
                      ) : account.type == 'discord' ? (
                        <FaDiscord size={22} />
                      ) : (
                        <User size={22} />
                      )}
                    </div>
                  </SelectItem>
                ))}
              </Select>
              <div className="flex gap-2">
                {selectedAccount ? (
                  <>
                    <Button
                      color="danger"
                      variant="flat"
                      isDisabled={consoles.consoles.some((c) => c.status == 'running')}
                      startContent={<UserMinus size={22} />}
                      onPress={async () => await deleteAccount()}
                    >
                      {t('accounts.delete')}
                    </Button>
                  </>
                ) : (
                  ''
                )}
                <Button variant="flat" startContent={<UserPlus size={22} />} onPress={openModalAdd}>
                  {t('accounts.add')}
                </Button>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
      <Modal
        size="md"
        isOpen={modalAddIsOpen}
        onClose={() => {
          if (!isSigning) closeModalAdd()
        }}
      >
        <ModalContent>
          <ModalHeader>{t('accounts.addingAccount')}</ModalHeader>
          <ModalBody>
            <div className="flex flex-col space-y-4">
              <div className="flex flex-col space-y-1">
                <p>{t('accounts.type')}:</p>
                <div className="flex flex-col space-y-2">
                  <div className="flex space-x-2 items-center">
                    <Button
                      variant="flat"
                      startContent={<User size={22} />}
                      isDisabled={isPlain || isSigning}
                      onPress={() => setIsPlain(true)}
                    >
                      {t('accounts.plainAccount')}
                    </Button>
                    <Button
                      variant="flat"
                      color={isSigning && signType == 'discord' ? 'danger' : undefined}
                      isDisabled={(isSigning && signType != 'discord') || !isNetwork}
                      startContent={
                        isSigning && signType == 'discord' ? (
                          <X size={22} />
                        ) : (
                          <FaDiscord size={22} />
                        )
                      }
                      onPress={async () => {
                        if (isSigning) {
                          setIsSigning(false)
                          setSignType(undefined)
                          addToast({
                            color: 'success',
                            title: t('accounts.cancelled')
                          })
                          return
                        }

                        await Auth('discord')
                      }}
                    >
                      {isSigning && signType == 'discord' ? t('common.cancel') : 'Discord'}
                    </Button>
                  </div>
                  <div className="flex space-x-2 items-center">
                    <Button
                      variant="flat"
                      color={isSigning && signType == 'microsoft' ? 'danger' : undefined}
                      startContent={
                        isSigning && signType == 'microsoft' ? (
                          <X size={22} />
                        ) : (
                          <FaMicrosoft size={22} />
                        )
                      }
                      isDisabled={(isSigning && signType != 'microsoft') || !isNetwork}
                      onPress={async () => {
                        if (isSigning) {
                          setIsSigning(false)
                          setSignType(undefined)
                          addToast({
                            color: 'success',
                            title: t('accounts.cancelled')
                          })
                          return
                        }

                        await Auth('microsoft')
                      }}
                    >
                      {isSigning && signType == 'microsoft'
                        ? t('common.cancel')
                        : t('accounts.microsoft')}
                    </Button>
                    <Button
                      variant="flat"
                      color={isSigning && signType == 'elyby' ? 'danger' : undefined}
                      startContent={
                        isSigning && signType == 'elyby' ? (
                          <X size={22} />
                        ) : (
                          <TbSquareLetterE size={22} />
                        )
                      }
                      isDisabled={(isSigning && signType != 'elyby') || !isNetwork}
                      onPress={async () => {
                        if (isSigning) {
                          setIsSigning(false)
                          setSignType(undefined)
                          return
                        }

                        await Auth('elyby')
                      }}
                    >
                      {isSigning && signType == 'elyby' ? t('common.cancel') : t('accounts.elyby')}
                    </Button>
                  </div>
                </div>
              </div>

              {isPlain ? (
                <div className="flex items-center gap-2 ">
                  <Input
                    label={t('accounts.nickname')}
                    placeholder={'Notch'}
                    className="w-full"
                    value={nickname}
                    onChange={(event) => setNickname(event.currentTarget.value)}
                    startContent={
                      nickname == '' ||
                      !!accounts?.find((a) => a.nickname == nickname && a.type == 'plain') ||
                      nickname.length < 3 ||
                      nickname.length > 16 ? (
                        <CircleAlert color="orange" size={22} />
                      ) : undefined
                    }
                  ></Input>
                  <Button
                    variant="flat"
                    isIconOnly
                    isDisabled={
                      nickname == '' ||
                      !!accounts?.find((a) => a.nickname == nickname && a.type == 'plain') ||
                      nickname.length < 3 ||
                      nickname.length > 16
                    }
                    onPress={async () => await addPlainAccount()}
                  >
                    <UserPlus size={22} />
                  </Button>
                </div>
              ) : (
                ''
              )}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
      {accountInfo && selectedAccount && accounts && user && (
        <AccountInfo
          onClose={() => {
            setAccountInfo(false)
          }}
          user={user}
          isOwner={true}
        />
      )}
    </>
  )
}
