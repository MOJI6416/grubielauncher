export type ConnectivityGroup =
  | 'grubie'
  | 'minecraft'
  | 'mirror'
  | 'mods'
  | 'loaders'
  | 'java'

export interface ConnectivityCheckPlanEntry {
  id: string
  name: string
  group: ConnectivityGroup
}

export interface ConnectivityCheckResult {
  id: string
  name: string
  group: ConnectivityGroup
  target: string
  ok: boolean
  latencyMs: number | null
  error?: string
}
