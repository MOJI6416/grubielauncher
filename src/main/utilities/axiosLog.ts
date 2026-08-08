import axios from 'axios'
import { reportFailure } from './failureBus'

export function logAxiosError(prefix: string, error: unknown, channel?: string) {
  if (channel) reportFailure(error, { channel })

  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const statusText = error.response?.statusText
    console.error(
      `${prefix}:`,
      status ? `HTTP ${status}${statusText ? ` ${statusText}` : ''}` : error.message
    )
    return
  }

  console.error(`${prefix}:`, error)
}
