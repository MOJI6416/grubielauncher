export type ConnectivityGroup =
  | 'grubie'
  | 'minecraft'
  | 'mods'
  | 'loaders'
  | 'java'

export interface ConnectivityCheckResult {
  id: string
  name: string
  group: ConnectivityGroup
  target: string
  ok: boolean
  latencyMs: number | null
  error?: string
}
