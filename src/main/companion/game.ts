import path from 'path'
import fs from 'fs-extra'
import type { FSWatcher } from 'fs'
import type {
  CompanionGameAction,
  CompanionHang,
  CompanionSession,
  CompanionStage
} from '@/shared/companion'
import { journal } from '../journal/journal'
import { gameProcesses, gameRuntime } from '../utilities/runtime'
import { lanShareService } from '../share'
import { setLiveWorldStats, clearLiveWorldStats } from '../utilities/worlds'
import type { IWorldStatistics } from '@/types/World'
import type { CompanionMessage } from './CompanionBridge'

const MAX_SCREENSHOT_BYTES = 16 * 1024 * 1024
const CANDIDATE_WAIT_MS = 4000

export interface CompanionGameHost {
  result(session: CompanionSession, req: string, ok: boolean, error?: string): void
  toRenderer(channel: string, payload: unknown): void
  pushScreenshot(session: CompanionSession, file: string): void
  count(feature: string): void
  pttFromGame(down: boolean): void
}

const watchers = new Map<string, FSWatcher>()
const pending = new Map<string, NodeJS.Timeout>()
const pttCounted = new Set<string>()

function keyOf(session: Pick<CompanionSession, 'versionName' | 'instance'>): string {
  return `${session.versionName}-${session.instance}`
}

function versionPathOf(session: Pick<CompanionSession, 'versionName' | 'instance'>): string | null {
  return gameProcesses.get(keyOf(session))?.versionPath ?? null
}

export function screenshotsDirOf(versionPath: string): string {
  return path.join(versionPath, 'screenshots')
}

export function isInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function watchScreenshots(session: CompanionSession, host: CompanionGameHost): void {
  const key = keyOf(session)
  const versionPath = versionPathOf(session)
  if (!versionPath || watchers.has(key)) return
  const dir = screenshotsDirOf(versionPath)
  try {
    fs.ensureDirSync(dir)
    const watcher = fs.watch(dir, (_event, name) => {
      if (!name || !name.toString().toLowerCase().endsWith('.png')) return
      const file = path.join(dir, name.toString())
      clearTimeout(pending.get(file))
      pending.set(
        file,
        setTimeout(() => {
          pending.delete(file)
          void fs
            .stat(file)
            .then((stat) => {
              if (stat.isFile() && stat.size > 0 && Date.now() - stat.mtimeMs < 15000) {
                host.pushScreenshot(session, file)
              }
            })
            .catch((error) => journal.debug('companion', 'screenshot vanished', { file, error: String(error) }))
        }, 600)
      )
    })
    watcher.on('error', (error) => journal.warn('companion', 'screenshot watcher failed', { error: String(error) }))
    watchers.set(key, watcher)
  } catch (error) {
    journal.warn('companion', 'screenshot watcher not started', { dir, error: String(error) })
  }
}

export function stopGame(session: Pick<CompanionSession, 'versionName' | 'instance'>): void {
  const key = keyOf(session)
  watchers.get(key)?.close()
  watchers.delete(key)
  pttCounted.delete(key)
  const versionPath = versionPathOf(session)
  if (versionPath) clearLiveWorldStats(versionPath)
}

function candidateReady(session: CompanionSession): boolean {
  const candidate = lanShareService.getState().candidate
  return Boolean(
    candidate && candidate.versionName === session.versionName && candidate.instance === session.instance
  )
}

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (check()) return true
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return check()
}

function hostingThis(session: CompanionSession): boolean {
  const state = lanShareService.getState()
  return Boolean(
    state.sessionId &&
      state.target?.versionName === session.versionName &&
      state.target?.instance === session.instance
  )
}

export async function startShare(
  session: CompanionSession,
  port: number
): Promise<{ ok: boolean; error?: string }> {
  if (hostingThis(session)) return { ok: true }
  if (lanShareService.getState().sessionId) return { ok: false, error: 'busy' }
  if (!(await waitFor(() => candidateReady(session), CANDIDATE_WAIT_MS))) {
    gameRuntime.emitStdout({
      key: keyOf(session),
      versionName: session.versionName,
      instance: session.instance,
      message: `Local game hosted on port ${port}`
    })
    if (!(await waitFor(() => candidateReady(session), CANDIDATE_WAIT_MS))) {
      return { ok: false, error: 'lan_not_found' }
    }
  }
  const result = await lanShareService.startShare('friends')
  if (result.ok) return { ok: true }
  const code = result.error?.code ?? ''
  if (code === 'lan_not_found') return { ok: false, error: 'lan_not_found' }
  if (code === 'share_busy' || code === 'share_already_running') return { ok: false, error: 'busy' }
  journal.warn('companion', 'share from the game failed', { code })
  return { ok: false, error: 'unknown' }
}

export async function stopShare(session: CompanionSession): Promise<{ ok: boolean; error?: string }> {
  if (!hostingThis(session)) return { ok: false, error: 'not_hosting' }
  const result = await lanShareService.stopShare()
  return result.ok ? { ok: true } : { ok: false, error: 'unknown' }
}

export function screenshotPathFor(session: CompanionSession, requested: string): string | null {
  const versionPath = versionPathOf(session)
  if (!versionPath) return null
  const dir = screenshotsDirOf(versionPath)
  const file = path.resolve(requested)
  if (!isInside(dir, file) || path.extname(file).toLowerCase() !== '.png') return null
  try {
    const stat = fs.statSync(file)
    return stat.isFile() && stat.size > 0 && stat.size <= MAX_SCREENSHOT_BYTES ? file : null
  } catch {
    return null
  }
}

export function handleGameMessage(
  message: CompanionMessage,
  session: CompanionSession,
  host: CompanionGameHost
): void {
  const toRenderer = (action: CompanionGameAction) => host.toRenderer('companion:action', { session, action })
  switch (message.t) {
    case 'decline':
      host.count("companion.decline")
      toRenderer({ kind: 'decline', id: message.id })
      return
    case 'invite':
      host.count("companion.invite")
      toRenderer({ kind: 'invite', req: message.req, friend: message.friend, server: message.server })
      return
    case 'join':
      host.count("companion.join")
      toRenderer({ kind: 'join', req: message.req, friend: message.friend })
      return
    case 'voice':
      host.count("companion.voice")
      toRenderer({ kind: 'voice', action: message.action })
      return
    case 'ptt': {
      const key = keyOf(session)
      if (message.down && !pttCounted.has(key)) {
        pttCounted.add(key)
        host.count("companion.ptt")
      }
      host.pttFromGame(message.down)
      return
    }
    case 'share': {
      const run = message.action === 'start' ? startShare(session, message.port) : stopShare(session)
      if (message.action === 'start') host.count("companion.share")
      void run.then(
        (outcome) => host.result(session, message.req, outcome.ok, outcome.error),
        (error) => {
          journal.failure('companion', 'share from the game failed', error)
          host.result(session, message.req, false, 'unknown')
        }
      )
      return
    }
    case 'sendScreenshot': {
      const file = screenshotPathFor(session, message.path)
      if (!file) {
        host.result(session, message.req, false, 'not_found')
        return
      }
      host.count("companion.screenshot")
      toRenderer({ kind: 'sendScreenshot', req: message.req, path: file, friend: message.friend })
      return
    }
    case 'stats': {
      if (message.kind === 'world') {
        const versionPath = versionPathOf(session)
        if (versionPath && !message.key.includes('/') && !message.key.includes('\\') && message.key !== '..') {
          const worldPath = path.join(versionPath, 'saves', message.key)
          setLiveWorldStats(worldPath, message.snapshot as unknown as IWorldStatistics)
        }
      }
      host.toRenderer('companion:stats', { session, kind: message.kind })
      return
    }
    case 'stage': {
      const stage: CompanionStage = {
        versionName: session.versionName,
        instance: session.instance,
        stage: message.stage,
        detail: message.detail
      }
      journal.info('companion', 'game stage', { ...stage })
      host.toRenderer('companion:stage', stage)
      return
    }
    case 'hang': {
      const hang: CompanionHang = {
        versionName: session.versionName,
        instance: session.instance,
        seconds: message.seconds,
        stage: message.stage,
        mods: message.mods,
        frames: message.frames
      }
      journal.warn('companion', 'game not responding', { ...hang })
      host.toRenderer('companion:hang', hang)
      return
    }
    default:
      return
  }
}
