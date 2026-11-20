import axios from 'axios'
import { reportFailure } from './failureBus'
import { redactCredentials } from '@/shared/logSanitizer'

const BODY_CODE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/
const BODY_MESSAGE_CHARS = 200

export function describeErrorBody(data: unknown): string {
  if (!data || typeof data !== 'object') return ''

  const { code, message } = data as { code?: unknown; message?: unknown }
  const text = Array.isArray(message)
    ? message.filter((part) => typeof part === 'string').join('; ')
    : typeof message === 'string'
      ? message
      : ''
  const safeCode = typeof code === 'string' && BODY_CODE.test(code) ? code : ''
  const safeText = text.trim().startsWith('<')
    ? ''
    : redactCredentials(text.trim().slice(0, BODY_MESSAGE_CHARS))

  return [safeCode, safeText].filter(Boolean).join(': ')
}

export function logAxiosError(prefix: string, error: unknown, channel?: string) {
  if (channel) reportFailure(error, { channel })

  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const statusText = error.response?.statusText
    const body = status ? describeErrorBody(error.response?.data) : ''
    console.error(
      `${prefix}:`,
      status
        ? `HTTP ${status}${statusText ? ` ${statusText}` : ''}${body ? ` (${body})` : ''}`
        : error.message
    )
    return
  }

  console.error(`${prefix}:`, error)
}
