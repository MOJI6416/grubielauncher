import { EventEmitter } from 'events'
import path from 'path'
import fs from 'fs-extra'
import type {
  ServerAdminAction,
  ServerAdminEvent,
  ServerAdminFallback,
  ServerAdminResult,
  ServerAdminSnapshot,
} from '@/types/ServerAdmin'
import { emptyServerAdminSnapshot } from '@/types/ServerAdmin'
import { ServerAdmin, ServerAdminIo } from './ServerAdmin'
import { MsmpPlan, prepareMsmp, supportsMsmpVersion } from './msmpSetup'

interface Prepared {
  plan: MsmpPlan | null
  fallback: ServerAdminFallback
}

async function readServerMcVersion(serverPath: string): Promise<string | null> {
  const versionJson = path.join(path.dirname(serverPath), 'version.json')
  const conf = await fs.readJSON(versionJson).catch(() => null)
  const id = conf?.version?.id
  return typeof id === 'string' ? id : null
}

class ServerAdminRegistry extends EventEmitter {
  private readonly prepared = new Map<string, Prepared>()
  private readonly admins = new Map<string, ServerAdmin>()

  private key(serverPath: string): string {
    return path.resolve(serverPath)
  }

  async prepare(serverPath: string, javaPath: string | null): Promise<Record<string, string>> {
    const key = this.key(serverPath)
    const mcVersion = await readServerMcVersion(key)

    if (!supportsMsmpVersion(mcVersion)) {
      this.prepared.set(key, { plan: null, fallback: 'old_version' })
      return {}
    }

    try {
      const plan = await prepareMsmp(key, javaPath)
      this.prepared.set(key, { plan, fallback: null })
      return plan.env
    } catch (error) {
      console.warn('[server:msmp] could not configure the management server:', error)
      this.prepared.set(key, { plan: null, fallback: 'connect_failed' })
      return {}
    }
  }

  attach(serverPath: string, io: ServerAdminIo): void {
    const key = this.key(serverPath)
    this.admins.get(key)?.dispose()

    const prepared = this.prepared.get(key) ?? { plan: null, fallback: null }
    this.prepared.delete(key)
    const admin = new ServerAdmin(key, io, prepared.plan, prepared.fallback)
    admin.on('event', (event: ServerAdminEvent) => this.emit('event', event))
    this.admins.set(key, admin)
  }

  handleOutput(serverPath: string, line: string): void {
    this.admins.get(this.key(serverPath))?.handleOutput(line)
  }

  handleReady(serverPath: string): void {
    const admin = this.admins.get(this.key(serverPath))
    if (!admin) return
    void admin.start().catch((error) => {
      console.warn('[server:admin] could not start server administration:', error)
    })
  }

  detach(serverPath: string): void {
    const key = this.key(serverPath)
    const admin = this.admins.get(key)
    if (!admin) return
    this.admins.delete(key)
    admin.dispose()
    this.emit('event', {
      serverPath: key,
      kind: 'changed',
      snapshot: emptyServerAdminSnapshot(key),
    } satisfies ServerAdminEvent)
  }

  snapshot(serverPath: string): ServerAdminSnapshot {
    const key = this.key(serverPath)
    return this.admins.get(key)?.snapshot() ?? emptyServerAdminSnapshot(key)
  }

  async perform(serverPath: string, action: ServerAdminAction): Promise<ServerAdminResult> {
    const admin = this.admins.get(this.key(serverPath))
    if (!admin) return { ok: false, error: 'server_not_running' }
    return await admin.perform(action)
  }

  async refresh(serverPath: string, gamerules: boolean): Promise<ServerAdminSnapshot> {
    const key = this.key(serverPath)
    const admin = this.admins.get(key)
    if (!admin) return emptyServerAdminSnapshot(key)
    return gamerules ? await admin.refreshGamerules() : await admin.refresh()
  }

  async kick(serverPath: string, name: string, message: string): Promise<boolean> {
    const result = await this.perform(serverPath, { type: 'kick', name, message })
    return result.ok
  }
}

export const serverAdmins = new ServerAdminRegistry()
