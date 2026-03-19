export type ShareVisibility = 'public' | 'friends'

export type ShareStatePhase =
  | 'idle'
  | 'lan_not_found'
  | 'lan_ready'
  | 'share_starting'
  | 'tunnel_connecting'
  | 'pending'
  | 'online'
  | 'reconnecting'
  | 'stopped'
  | 'conflict'
  | 'error'

export type ShareErrorCode =
  | 'use_public_address'
  | 'session_not_online'
  | 'active_share_exists'
  | 'not_friend'
  | 'lan_not_found'
  | 'local_port_unreachable'
  | 'share_not_started'
  | 'not_authenticated'
  | 'share_already_running'
  | 'share_busy'
  | 'tunnel_auth_failed'
  | 'tunnel_disconnected'
  | 'tunnel_protocol_error'
  | 'join_share_not_found'
  | 'invalid_response'
  | 'unknown'

export interface ShareStateError {
  code: ShareErrorCode
  message: string
  status?: number
}

export interface ShareLanCandidate {
  key: string
  versionName: string
  instance: number
  localPort: number
  detectedAt: string
  isReachable: boolean
}

export interface ShareSessionMeta {
  sessionId?: string
  slug?: string
  publicAddress?: string
  visibility?: ShareVisibility
}

export interface ShareState extends ShareSessionMeta {
  phase: ShareStatePhase
  candidate: ShareLanCandidate | null
  target: ShareLanCandidate | null
  isTunnelConnected: boolean
  isAuthenticated: boolean
  isHeartbeatActive: boolean
  isDegraded: boolean
  reconnectAttempt: number
  joinTicketTtlSec?: number
  heartbeatIntervalSec?: number
  lastAuthOkAt?: string
  lastHeartbeatAt?: string
  lastError?: ShareStateError
  updatedAt: string
}

export interface ShareStartRequest {
  localPort: number
  visibility: ShareVisibility
  mcVersion?: string
  launcherVersion?: string
}

export interface ShareStartResponse {
  sessionId: string
  slug: string
  publicAddress: string
  gatewayUrl: string
  gatewayToken: string
  visibility: ShareVisibility
  heartbeatIntervalSec: number
  joinTicketTtlSec: number
}

export interface ShareHeartbeatResponse {
  ok: true
  expiresInSec: number
}

export interface ShareAccessResponse {
  ok: true
  visibility: ShareVisibility
}

export interface ShareStopResponse {
  ok: true
}

export interface ShareJoinTicketResponse {
  ticketId: string
  connectHost: string
  expiresInSec: number
  sessionId: string
}

export interface ActiveFriendShare {
  sessionId: string
  hostUserId: string
  hostNickname: string
  slug: string
  visibility: ShareVisibility
  publicAddress: string
  startedAt: string
}

export interface ActiveFriendSharesResponse {
  items: ActiveFriendShare[]
}

export interface ShareCommandResult<T = void> {
  ok: boolean
  data?: T
  error?: ShareStateError
}

export interface ResolvedFriendShareConnection {
  slug: string
  sessionId: string
  visibility: ShareVisibility
  connectHost: string
  source: 'public_address' | 'join_ticket'
  expiresInSec?: number
}

export interface SharePeerInfo {
  streamId: number
  peerIp: string
  peerPort: number
  connectedAt: string
}
