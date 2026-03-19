import { ShareErrorCode, ShareStateError } from '@/types/Share'
import axios from 'axios'

export class ShareServiceError extends Error {
  public readonly code: ShareErrorCode
  public readonly status?: number

  constructor(code: ShareErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'ShareServiceError'
    this.code = code
    this.status = status
  }
}

function mapApiErrorCode(code: unknown, status?: number): ShareErrorCode {
  switch (code) {
    case 'use_public_address':
    case 'session_not_online':
    case 'active_share_exists':
    case 'not_friend':
      return code
    default:
      if (status === 401) return 'not_authenticated'
      if (status === 404) return 'join_share_not_found'
      return 'unknown'
  }
}

export function createShareError(
  code: ShareErrorCode,
  message: string,
  status?: number,
): ShareStateError {
  return {
    code,
    message,
    status,
  }
}

export function toShareStateError(
  error: unknown,
  fallbackCode: ShareErrorCode = 'unknown',
  fallbackMessage = 'Unexpected share error',
): ShareStateError {
  if (error instanceof ShareServiceError) {
    return createShareError(error.code, error.message, error.status)
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const responseData = error.response?.data as
      | {
          code?: string
          message?: string
        }
      | undefined

    return createShareError(
      mapApiErrorCode(responseData?.code, status),
      responseData?.message || error.message || fallbackMessage,
      status,
    )
  }

  if (error instanceof Error) {
    return createShareError(fallbackCode, error.message || fallbackMessage)
  }

  return createShareError(fallbackCode, fallbackMessage)
}
