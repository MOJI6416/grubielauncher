import { ShareState, ShareStateError } from '@/types/Share'
import { EventEmitter } from 'events'

function nowIso(): string {
  return new Date().toISOString()
}

export function createInitialShareState(): ShareState {
  return {
    phase: 'idle',
    candidate: null,
    target: null,
    isTunnelConnected: false,
    isAuthenticated: false,
    isHeartbeatActive: false,
    isDegraded: false,
    reconnectAttempt: 0,
    updatedAt: nowIso(),
  }
}

export class ShareStateStore extends EventEmitter {
  private state: ShareState = createInitialShareState()

  public getState(): ShareState {
    return {
      ...this.state,
      candidate: this.state.candidate ? { ...this.state.candidate } : null,
      target: this.state.target ? { ...this.state.target } : null,
      lastError: this.state.lastError ? { ...this.state.lastError } : undefined,
    }
  }

  public setState(nextState: ShareState): ShareState {
    this.state = {
      ...nextState,
      updatedAt: nowIso(),
    }
    const snapshot = this.getState()
    this.emit('change', snapshot)
    return snapshot
  }

  public patch(patch: Partial<ShareState>): ShareState {
    return this.setState({
      ...this.state,
      ...patch,
      lastError:
        patch.lastError === undefined ? this.state.lastError : patch.lastError,
    })
  }

  public reset(extra?: Partial<ShareState>): ShareState {
    return this.setState({
      ...createInitialShareState(),
      ...(extra || {}),
    })
  }

  public setError(error: ShareStateError, phase: ShareState['phase'] = 'error'): ShareState {
    return this.patch({
      phase,
      lastError: error,
      isDegraded: phase === 'reconnecting',
    })
  }
}
