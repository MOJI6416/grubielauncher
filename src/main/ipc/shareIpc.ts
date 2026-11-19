import {
  ShareCommandResult,
  ShareGuestLink,
  ShareGuestRef,
  ShareHostPatch,
  ShareMember,
  ShareState,
  ShareVisibility,
} from '@/types/Share'
import { directGuest, lanShareService } from '../share'
import { setDirectPolicy } from '../share/directPolicy'
import { isValidShareSlug } from '../share/shareProtocol'
import { registerMsFriendsIpc } from './msFriendsIpc'
import { check, handleSafe } from '../utilities/ipc'
import { assertReadablePath } from '../utilities/safePath'
import { mainWindow } from '../windows/mainWindow'

let listenersRegistered = false

function safeSend(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return
  }

  try {
    mainWindow.webContents.send(channel, payload)
  } catch {}
}

function registerShareEvents(): void {
  if (listenersRegistered) return
  listenersRegistered = true

  lanShareService.on('stateChanged', (state) => {
    safeSend('share:stateChanged', state)
  })

  lanShareService.on('shareError', (error) => {
    safeSend('share:error', error)
  })

  lanShareService.on('peersChanged', (peers) => {
    safeSend('share:peersChanged', peers)
  })

  lanShareService.on('guestRefused', (event) => {
    safeSend('share:guestRefused', event)
  })

  directGuest.on('changed', (links: ShareGuestLink[]) => {
    safeSend('share:guestLinksChanged', links)
  })
}

const USER_ID = /^[a-f0-9]{24}$/i
const GUEST_NAME = /^[\x21-\x7E]{1,16}$/

function readHostPatch(value: Record<string, unknown>): ShareHostPatch {
  const patch: ShareHostPatch = {}
  if (typeof value.inviteOnly === 'boolean') patch.inviteOnly = value.inviteOnly
  if (typeof value.maxGuests === 'number' && Number.isInteger(value.maxGuests)) {
    patch.maxGuests = Math.max(0, Math.min(100, value.maxGuests))
  }
  if (Array.isArray(value.members)) {
    patch.members = value.members
      .filter(
        (entry): entry is ShareMember =>
          !!entry &&
          typeof entry === 'object' &&
          typeof (entry as ShareMember).userId === 'string' &&
          USER_ID.test((entry as ShareMember).userId),
      )
      .slice(0, 200)
      .map((entry) => ({
        userId: entry.userId.toLowerCase(),
        nickname: typeof entry.nickname === 'string' ? entry.nickname.slice(0, 64) : '',
      }))
  }
  return patch
}

function readGuest(value: Record<string, unknown>): ShareGuestRef & { nickname?: string } {
  return {
    userId:
      typeof value.userId === 'string' && USER_ID.test(value.userId) ? value.userId : undefined,
    username:
      typeof value.username === 'string' && GUEST_NAME.test(value.username)
        ? value.username
        : undefined,
    nickname: typeof value.nickname === 'string' ? value.nickname.slice(0, 64) : undefined,
  }
}

export function registerShareIpc() {
  registerShareEvents()
  registerMsFriendsIpc()

  handleSafe<ShareGuestLink | null, [Record<string, unknown>]>(
    'share:openGuestLink',
    null,
    [check.object(8)],
    async (_, request) => {
      const slug = typeof request.slug === 'string' ? request.slug : ''
      const connectHost = typeof request.connectHost === 'string' ? request.connectHost : ''
      if (!isValidShareSlug(slug) || !connectHost || connectHost.length > 255) return null
      return await directGuest.open({
        slug,
        connectHost,
        hostUserId:
          typeof request.hostUserId === 'string' && USER_ID.test(request.hostUserId)
            ? request.hostUserId
            : undefined,
      })
    },
  )

  handleSafe<ShareGuestLink[]>('share:getGuestLinks', [], async () => directGuest.list())

  handleSafe<boolean, [Record<string, unknown>]>(
    'share:setDirectPolicy',
    false,
    [check.object(4)],
    async (_, value) => {
      setDirectPolicy({
        directConnect: value.directConnect !== false,
        streamerMode: value.streamerMode === true,
      })
      return true
    },
  )

  handleSafe<ShareCommandResult<ShareState>, [ShareVisibility]>(
    'share:start',
    {
      ok: false,
      error: {
        code: 'unknown',
        message: 'Failed to start share',
      },
    },
    [check.oneOf('public', 'friends')],
    async (_, visibility) => {
      return await lanShareService.startShare(visibility)
    },
  )

  handleSafe<ShareCommandResult<ShareState>>(
    'share:stop',
    {
      ok: false,
      error: {
        code: 'unknown',
        message: 'Failed to stop share',
      },
    },
    async () => {
      return await lanShareService.stopShare()
    },
  )

  handleSafe<ShareCommandResult<ShareState>, [ShareVisibility]>(
    'share:updateVisibility',
    {
      ok: false,
      error: {
        code: 'unknown',
        message: 'Failed to update share visibility',
      },
    },
    [check.oneOf('public', 'friends')],
    async (_, visibility) => {
      return await lanShareService.updateVisibility(visibility)
    },
  )

  handleSafe<ShareCommandResult<ShareState>, [string]>(
    'share:registerServer',
    { ok: false, error: { code: 'unknown', message: 'Failed to prepare the server for sharing' } },
    [check.nonEmptyString(4096)],
    async (_, serverPath) => {
      assertReadablePath(serverPath, 'share:registerServer')
      return await lanShareService.registerServerTarget(serverPath)
    },
  )

  handleSafe<ShareCommandResult<ShareState>, [Record<string, unknown>]>(
    'share:updateHost',
    { ok: false, error: { code: 'unknown', message: 'Failed to update host controls' } },
    [check.object(8)],
    async (_, patch) => {
      return await lanShareService.updateHostControls(readHostPatch(patch))
    },
  )

  handleSafe<ShareCommandResult<ShareState>, [Record<string, unknown>]>(
    'share:kickGuest',
    { ok: false, error: { code: 'unknown', message: 'Failed to remove the guest' } },
    [check.object(8)],
    async (_, guest) => {
      return await lanShareService.kickGuest(readGuest(guest))
    },
  )

  handleSafe<ShareCommandResult<ShareState>, [Record<string, unknown>]>(
    'share:restoreGuest',
    { ok: false, error: { code: 'unknown', message: 'Failed to let the guest back' } },
    [check.object(8)],
    async (_, guest) => {
      return await lanShareService.restoreGuest(readGuest(guest))
    },
  )

  handleSafe<ShareState>('share:getState', () => lanShareService.getState(), async () => {
    return lanShareService.getState()
  })

  handleSafe(
    'share:getPeers',
    [],
    async () => {
      return lanShareService.getPeers()
    },
  )

  handleSafe(
    'share:fetchActiveFriendShares',
    {
      ok: false,
      error: {
        code: 'unknown',
        message: 'Failed to fetch active friend shares',
      },
    },
    async () => {
      return await lanShareService.fetchActiveFriendShares()
    },
  )

  handleSafe(
    'share:connectToFriendShare',
    {
      ok: false,
      error: {
        code: 'unknown',
        message: 'Failed to connect to friend share',
      },
    },
    [check.nonEmptyString(128)],
    async (_, slug: string) => {
      return await lanShareService.connectToFriendShare(slug)
    },
  )
}
