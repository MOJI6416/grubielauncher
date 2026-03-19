import { ChildProcessWithoutNullStreams } from 'child_process'
import { EventEmitter } from 'events'

export interface GameProcessRecord {
  process: ChildProcessWithoutNullStreams
  versionName: string
  instance: number
  versionPath: string
  serverPort: number | null
  accessToken: string
}

export interface GameStdoutEvent {
  key: string
  versionName: string
  instance: number
  message: string
}

export interface GameProcessStartedEvent {
  key: string
  versionName: string
  instance: number
}

export interface GameProcessCloseEvent {
  key: string
  versionName: string
  instance: number
  code: number
}

export interface GameServerConnectionEvent {
  key: string
  versionName: string
  instance: number
  serverAddress: string
  serverPort: number
}

type RuntimeEvents = {
  started: (event: GameProcessStartedEvent) => void
  stdout: (event: GameStdoutEvent) => void
  stderr: (event: GameStdoutEvent) => void
  close: (event: GameProcessCloseEvent) => void
  serverConnection: (event: GameServerConnectionEvent) => void
}

class GameRuntime extends EventEmitter {
  public readonly processes = new Map<string, GameProcessRecord>()

  public makeKey(versionName: string, instance: number): string {
    return `${versionName}-${instance}`
  }

  public register(record: GameProcessRecord): string {
    const key = this.makeKey(record.versionName, record.instance)
    this.processes.set(key, record)
    return key
  }

  public unregister(versionName: string, instance: number): void {
    this.processes.delete(this.makeKey(versionName, instance))
  }

  public get(versionName: string, instance: number): GameProcessRecord | undefined {
    return this.processes.get(this.makeKey(versionName, instance))
  }

  public emitStdout(event: GameStdoutEvent): void {
    this.emit('stdout', event)
  }

  public emitStarted(event: GameProcessStartedEvent): void {
    this.emit('started', event)
  }

  public emitStderr(event: GameStdoutEvent): void {
    this.emit('stderr', event)
  }

  public emitClose(event: GameProcessCloseEvent): void {
    this.emit('close', event)
  }

  public emitServerConnection(event: GameServerConnectionEvent): void {
    this.emit('serverConnection', event)
  }

  public on<K extends keyof RuntimeEvents>(eventName: K, listener: RuntimeEvents[K]): this {
    return super.on(eventName, listener)
  }

  public off<K extends keyof RuntimeEvents>(eventName: K, listener: RuntimeEvents[K]): this {
    return super.off(eventName, listener)
  }
}

export const gameRuntime = new GameRuntime()
export const gameProcesses = gameRuntime.processes
