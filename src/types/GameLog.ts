export type GameLogKind = 'latest' | 'debug' | 'archive' | 'crash' | 'native'

export interface IGameLogFile {
  name: string
  kind: GameLogKind
  size: number
  modifiedAt: number
}

export interface IGameLogDiagnosis {
  analysis: import('./CrashAnalysis').CrashAnalysisPayload | null
  signature: string
}

export interface IGameLogContent {
  text: string
  truncated: boolean
  size: number
  path: string
}
