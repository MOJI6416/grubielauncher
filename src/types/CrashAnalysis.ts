export interface CrashRuleMessages {
  en: string
  ru: string
  uk: string
}

export interface CrashRule {
  id: string
  pattern?: string
  flags?: string
  exitCodes?: number[]
  culpritPattern?: string
  culpritFlags?: string
  messages: CrashRuleMessages
}

export interface CrashAnalysisPayload {
  ruleId: string
  messages: CrashRuleMessages
  culprits: string[]
  reportPath: string | null
}
