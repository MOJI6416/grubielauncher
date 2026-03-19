import type {
  ActiveFriendShare,
  ResolvedFriendShareConnection,
  ShareState,
  ShareStateError,
} from '@/types/Share'

export const RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000, 15000]

export function getReconnectDelay(attempt: number): number {
  const safeAttempt = Math.max(attempt, 1)
  return RECONNECT_BACKOFF_MS[Math.min(safeAttempt - 1, RECONNECT_BACKOFF_MS.length - 1)]
}

export function applyAuthOkState(state: ShareState): ShareState {
  return {
    ...state,
    phase: 'online',
    isTunnelConnected: true,
    isAuthenticated: true,
    isHeartbeatActive: false,
    isDegraded: false,
    reconnectAttempt: 0,
    lastAuthOkAt: new Date().toISOString(),
    lastError: undefined,
  }
}

export function applyTunnelDisconnectedState(
  state: ShareState,
  reason: string,
  hasAuthenticatedOnce: boolean,
): ShareState {
  const lastError: ShareStateError = {
    code: 'tunnel_disconnected',
    message: `Tunnel disconnected: ${reason}`,
  }

  if (hasAuthenticatedOnce) {
    return {
      ...state,
      phase: 'reconnecting',
      isTunnelConnected: false,
      isAuthenticated: false,
      isHeartbeatActive: false,
      isDegraded: true,
      lastError,
    }
  }

  return {
    ...state,
    phase: 'pending',
    isTunnelConnected: false,
    isAuthenticated: false,
    isHeartbeatActive: false,
    isDegraded: false,
    lastError,
  }
}

export function resolveFriendShareConnection(
  share: ActiveFriendShare,
  joinResult?: {
    connectHost: string
    sessionId: string
    expiresInSec: number
  },
  joinErrorCode?: string,
): ResolvedFriendShareConnection | null {
  if (share.visibility === 'public' || joinErrorCode === 'use_public_address') {
    return {
      slug: share.slug,
      sessionId: share.sessionId,
      visibility: 'public',
      connectHost: share.publicAddress,
      source: 'public_address',
    }
  }

  if (!joinResult) {
    return null
  }

  return {
    slug: share.slug,
    sessionId: joinResult.sessionId,
    visibility: 'friends',
    connectHost: joinResult.connectHost,
    source: 'join_ticket',
    expiresInSec: joinResult.expiresInSec,
  }
}
