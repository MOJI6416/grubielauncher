export type RtcRole = 'host' | 'guest'

export interface RtcIceServer {
  urls: string[]
  username?: string
  credential?: string
}

export type RtcCommand =
  | { cmd: 'create'; peerId: string; role: RtcRole; iceServers: RtcIceServer[] }
  | { cmd: 'offer'; peerId: string }
  | { cmd: 'answer'; peerId: string; sdp: string }
  | { cmd: 'accept'; peerId: string; sdp: string }
  | { cmd: 'open'; peerId: string; channelId: number }
  | { cmd: 'closeChannel'; peerId: string; channelId: number }
  | { cmd: 'close'; peerId: string }
  | { cmd: 'stats'; peerId: string }

export interface RtcRequest {
  id: number
  command: RtcCommand
}

export interface RtcReply {
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

export interface RtcPathStats {
  localCandidateType?: string
  remoteCandidateType?: string
  rttSeconds?: number
}

export type RtcEvent =
  | { type: 'state'; peerId: string; state: string }
  | { type: 'channelOpen'; peerId: string; channelId: number }
  | { type: 'channelClose'; peerId: string; channelId: number }
  | { type: 'buffered'; peerId: string; channelId: number; amount: number }

export interface RtcData {
  peerId: string
  channelId: number
  data: Uint8Array
}

export const RTC_CHANNEL_PREFIX = 'mc:'
export const RTC_CONTROL_LABEL = 'ctl'
export const RTC_BUFFER_HIGH = 512 * 1024
export const RTC_BUFFER_LOW = 128 * 1024

export function channelLabel(channelId: number): string {
  return `${RTC_CHANNEL_PREFIX}${channelId}`
}

export function parseChannelLabel(label: string): number | null {
  if (!label.startsWith(RTC_CHANNEL_PREFIX)) return null
  const value = Number(label.slice(RTC_CHANNEL_PREFIX.length))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}
