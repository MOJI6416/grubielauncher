import { ChildProcessWithoutNullStreams } from 'child_process'
import { closeGame, installServer, runGame, runJar } from '../utilities/game'
import { handleSafe } from '../utilities/ipc'

export const gameProcesses = new Map<
  string,
  {
    process: ChildProcessWithoutNullStreams
    serverPort: number | null
    accessToken: string
  }
>()


export function registerGameIpc() {
  handleSafe<any>('game:runJar', null, async (_event, command: string, args: string[], cwd: string) => {
    return await runJar(command, args, cwd)
  })

  handleSafe<any>(
    'game:installServer',
    null,
    async (_event, command: string, args: string[], serverPath: string) => {
      return await installServer(command, args, serverPath)
    }
  )

  handleSafe<boolean>('game:closeGame', false, async (_event, versionName: string, instance: number) => {
    closeGame(versionName, instance)
    return true
  })

  handleSafe<boolean>(
    'game:runGame',
    false,
    async (
      _event,
      command: string,
      args: string[],
      versionPath: string,
      versionName: string,
      instance: number,
      accessToken: string
    ) => {
      runGame(command, args, versionPath, versionName, instance, accessToken)
      return true
    }
  )
}
