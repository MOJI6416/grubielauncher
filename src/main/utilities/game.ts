import { spawn } from 'child_process'
import { gameProcesses } from '../ipc/gameIpc'
import { mainWindow } from '../windows/mainWindow'
import { IConsoleMessage } from '@/types/Console'
import netstat from 'node-netstat'
import { rpc } from '../rpc'

export function runJar(command: string, args: string[], cwd: string) {
  return new Promise((resolve, reject) => {
    const server = spawn(command, args, {
      cwd
    })

    server.on('close', (code) => {
      resolve(code)
    })

    server.stderr.on('data', (data) => {
      reject(data.toString())
    })
  })
}

export function installServer(command: string, args: string[], serverPath: string) {
  return new Promise((resolve) => {
    const server = spawn(command, args, {
      cwd: serverPath
    })

    server.stdout.on('data', (data) => {
      const output = data.toString()

      if (output.includes('EULA')) {
        resolve('done')
      }
    })

    server.on('close', (code) => {
      resolve(code)
    })
  })
}

export function closeGame(versionName: string, instance: number) {
  const instanceKey = `${versionName}-${instance}`
  const javaProcess = gameProcesses.get(instanceKey)
  if (javaProcess) {
    javaProcess.process.kill()
    gameProcesses.delete(instanceKey)
  }
}

export function runGame(
  command: string,
  args: string[],
  versionPath: string,
  versionName: string,
  instance: number,
  accessToken: string
) {
  mainWindow?.webContents.send('consoleClear', versionName, instance)

  const javaProcess = spawn(command, args, {
    cwd: versionPath
  })

  gameProcesses.set(`${versionName}-${instance}`, {
    process: javaProcess,
    serverPort: null,
    accessToken
  })

  javaProcess.stdout.on('data', async (data) => {
    const message = data.toString()

    if (message.includes('Setting gameDir') || message.includes('Setting user')) {
      mainWindow?.minimize()
      mainWindow?.webContents.send('launch')
    }

    const connectMatch = message.match(/Connecting to ([\w.-]+), (\d+)/)
    const processData = gameProcesses.get(`${versionName}-${instance}`)
    if (connectMatch) {
      const serverAddress = connectMatch[1]
      processData!.serverPort = parseInt(connectMatch[2], 10)
      const { serverPort } = processData!
      mainWindow?.webContents.send('friendUpdate', {
        serverAddress: `${serverAddress}:${serverPort}`
      })
    }

    const msg: IConsoleMessage = {
      type: 'info',
      message,
      tips: []
    }
    mainWindow?.webContents.send('consoleMessage', versionName, instance, msg)
  })

  javaProcess.stderr.on('data', (data) => {
    const msg: IConsoleMessage = {
      type: 'error',
      message: data.toString(),
      tips: []
    }
    mainWindow?.webContents.send('consoleMessage', versionName, instance, msg)
  })

  const checkConnection = (): void => {
    const processData = gameProcesses.get(`${versionName}-${instance}`)
    if (!processData || !processData.serverPort) {
      return
    }

    try {
      const connections: any[] = []

      netstat(
        {
          filter: {
            remote: {
              port: processData.serverPort
            },
            protocol: 'tcp'
          }
        },
        (item: any) => {
          if (item.state == 'ESTABLISHED') connections.push(item)
        }
      )

      setTimeout(() => {
        if (connections.length === 0) {
          mainWindow?.webContents.send('friendUpdate', { serverAddress: '' })
          processData.serverPort = null
        }
      }, 1000)
    } catch {}
  }

  const intervalId = setInterval(checkConnection, 5000)

  javaProcess.on('close', (c, signal) => {
    let code = c
    if (signal == 'SIGTERM') code = 0

    const msg: IConsoleMessage = {
      type: 'info',
      message: `Game closed with code ${code}`,
      tips: []
    }

    mainWindow?.webContents.send('consolePublicAddress', versionName, instance, undefined)

    if (code === 0) {
      mainWindow?.webContents.send('consoleChangeStatus', versionName, instance, 'stopped')
      msg.type = 'success'
    } else {
      mainWindow?.webContents.send('consoleChangeStatus', versionName, instance, 'error')
      msg.type = 'error'
      msg.tips.push('checkIntegrity')
    }

    mainWindow?.webContents.send('consoleMessage', versionName, instance, msg)

    clearInterval(intervalId)

    gameProcesses.delete(`${versionName}-${instance}`)

    if (mainWindow?.isMinimized()) {
      mainWindow?.restore()
    }

    mainWindow?.webContents.send('launch')
    rpc.updateActivity()
    mainWindow?.webContents.send('friendUpdate', {
      versionName: '',
      versionCode: '',
      serverAddress: ''
    })
  })
}
