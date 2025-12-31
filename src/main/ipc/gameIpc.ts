import { ChildProcessWithoutNullStreams } from 'child_process'
import { ipcMain } from 'electron'
import { closeGame, installServer, runGame, runJar } from '../utilities/game'

export const gameProcesses = new Map<
  string,
  {
    process: ChildProcessWithoutNullStreams
    serverPort: number | null
    accessToken: string
  }
>()

export function registerGameIpc() {
  ipcMain.handle('game:runJar', async (_event, command, args, cwd) => {
    return runJar(command, args, cwd)
  })

  ipcMain.handle('game:installServer', async (_event, command, args, serverPath: string) => {
    return installServer(command, args, serverPath)
  })

  ipcMain.handle('game:closeGame', async (_event, versionName: string, instance: number) => {
    return closeGame(versionName, instance)
  })

  ipcMain.handle(
    'game:runGame',
    async (
      _event,
      command,
      args,
      versionPath: string,
      versionName: string,
      instance: number,
      accessToken: string
    ) => {
      return runGame(command, args, versionPath, versionName, instance, accessToken)
    }
  )
}
