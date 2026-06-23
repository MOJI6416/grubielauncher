import { closeGame } from '../utilities/game'
import { handleSafe } from '../utilities/ipc'


export function registerGameIpc() {
  handleSafe<boolean>('game:closeGame', false, async (_event, versionName: string, instance: number) => {
    await closeGame(versionName, instance)
    return true
  })
}
