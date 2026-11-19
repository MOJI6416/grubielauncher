import type { MsFriendAction, MsFriendsResult } from '@/shared/msFriends'
import { fetchMsFriends, updateMsFriend } from '../services/msFriends'
import { gameProcesses } from '../utilities/runtime'
import { check, handleSafe } from '../utilities/ipc'

const FAILED: MsFriendsResult = { ok: false, error: 'unavailable' }

function shouldAnnounce(): boolean {
  return gameProcesses.size === 0
}

export function registerMsFriendsIpc(): void {
  handleSafe<MsFriendsResult, [string]>(
    'msFriends:get',
    FAILED,
    [check.nonEmptyString(8192)],
    async (_, accountJwt) => await fetchMsFriends(accountJwt, shouldAnnounce()),
  )

  handleSafe<MsFriendsResult, [string, MsFriendAction, Record<string, unknown>]>(
    'msFriends:update',
    FAILED,
    [check.nonEmptyString(8192), check.oneOf('add', 'accept', 'remove'), check.object(4)],
    async (_, accountJwt, action, target) =>
      await updateMsFriend(
        accountJwt,
        action,
        {
          profileId: typeof target.profileId === 'string' ? target.profileId : undefined,
          name: typeof target.name === 'string' ? target.name : undefined,
        },
        shouldAnnounce(),
      ),
  )
}
