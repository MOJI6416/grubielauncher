import { ShareCommandResult, ShareState, ShareVisibility } from '@/types/Share'
import { lanShareService } from '../share'
import { handleSafe } from '../utilities/ipc'
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
}

export function registerShareIpc() {
  registerShareEvents()

  handleSafe<ShareCommandResult<ShareState>, [ShareVisibility]>(
    'share:start',
    {
      ok: false,
      error: {
        code: 'unknown',
        message: 'Failed to start share',
      },
    },
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
    async (_, visibility) => {
      return await lanShareService.updateVisibility(visibility)
    },
  )

  handleSafe<ShareState>('share:getState', lanShareService.getState(), async () => {
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
    'share:requestJoinTicket',
    {
      ok: false,
      error: {
        code: 'unknown',
        message: 'Failed to request join ticket',
      },
    },
    async (_, slug: string) => {
      return await lanShareService.requestJoinTicket(slug)
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
    async (_, slug: string) => {
      return await lanShareService.connectToFriendShare(slug)
    },
  )
}
