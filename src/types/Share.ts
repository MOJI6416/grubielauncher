export type ShareVisibility = 'public' | 'friends'

export type ShareKind = 'world' | 'server'

export type ShareAccessMode = 'friends' | 'invite' | 'public'

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
  | 'tunnel_already_active'
  | 'tunnel_disconnected'
  | 'tunnel_handshake_timeout'
  | 'tunnel_protocol_error'
  | 'tunnel_version_unsupported'
  | 'join_share_not_found'
  | 'not_invited'
  | 'removed_by_host'
  | 'server_not_running'
  | 'invalid_response'
  | 'unknown'

export interface ShareStateError {
  code: ShareErrorCode
  message: string
  status?: number
}

export interface ShareStreamDiagnostic {
  streamId: number
  reason: string
  source: 'local_proxy' | 'gateway'
  at: string
}

export interface ShareLanCandidate {
  key: string
  versionName: string
  instance: number
  localPort: number
  detectedAt: string
  isReachable: boolean
  kind?: ShareKind
  serverPath?: string
}

export interface ShareMember {
  userId: string
  nickname: string
}

export interface ShareHostControls {
  inviteOnly: boolean
  members: ShareMember[]
  maxGuests: number
}

export interface ShareRemovedGuest {
  userId?: string
  username?: string
  nickname: string
}

export interface ShareHostState extends ShareHostControls {
  removed: ShareRemovedGuest[]
  apiSynced: boolean | null
}

export type ShareHostPatch = Partial<ShareHostControls>

export interface ShareGuestRef {
  userId?: string
  username?: string
}

export type ShareGuestRefusal = 'removed' | 'not_invited' | 'full'

export interface ShareGuestRefusedEvent extends ShareGuestRef {
  streamId: number
  reason: ShareGuestRefusal
  at: string
}

export interface ShareSessionMeta {
  sessionId?: string
  slug?: string
  publicAddress?: string
  visibility?: ShareVisibility
}

export interface ShareState extends ShareSessionMeta {
  phase: ShareStatePhase
  host?: ShareHostState
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
  lastStreamDiagnostic?: ShareStreamDiagnostic
  updatedAt: string
}

export interface ShareStartRequest {
  localPort: number
  visibility: ShareVisibility
  mcVersion?: string
  launcherVersion?: string
  versionShareCode?: string
  kind?: ShareKind
  title?: string
  inviteOnly?: boolean
  memberUserIds?: string[]
  maxGuests?: number
}

export interface ShareHostControlsRequest {
  inviteOnly?: boolean
  memberUserIds?: string[]
  removedUserIds?: string[]
  maxGuests?: number
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
  host?: ShareHostControlsResponse
}

export interface ShareHostControlsResponse {
  kind: ShareKind
  title: string
  inviteOnly: boolean
  memberUserIds: string[]
  removedUserIds: string[]
  maxGuests: number
}

export interface ShareHeartbeatResponse {
  ok: true
  expiresInSec: number
  restored?: boolean
}

export interface ShareGatewayTokenResponse {
  gatewayUrl: string
  gatewayToken: string
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
  versionShareCode?: string
  startedAt: string
  kind?: ShareKind
  title?: string
  inviteOnly?: boolean
  maxGuests?: number
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

export type ShareTransport = 'relay' | 'direct' | 'turn'

export interface SharePeerInfo {
  streamId: number
  peerIp: string
  peerPort: number
  connectedAt: string
  guestUserId?: string
  guestUsername?: string
  transport?: ShareTransport
  rttMs?: number
}

export type ShareGuestLinkState = 'connecting' | 'connected' | 'closed'

export interface ShareGuestLink {
  slug: string
  hostUserId?: string
  address: string
  transport: ShareTransport
  state: ShareGuestLinkState
  rttMs?: number
  fallbackReason?: string
  updatedAt: string
}

export interface ShareGuestLinkRequest {
  slug: string
  connectHost: string
  hostUserId?: string
}
