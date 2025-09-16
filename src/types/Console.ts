export interface IConsole {
  versionName: string
  instance: number
  status: 'running' | 'stopped' | 'error'
  startTime: number
  messages: IConsoleMessage[]
}

export interface IConsoleMessage {
  type: 'info' | 'error' | 'success'
  message: string
  tips: string[]
}

export interface IConsoles {
  consoles: IConsole[]
}
