import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { PathPolicyError } from './safePath'
import { classifyError, FailureInfo } from '@/shared/errors'
import { redactSecrets } from '@/shared/logSanitizer'
import { wrapIpcFailure } from '@/shared/ipcFailureEnvelope'
import { randomUUID } from 'crypto'

const ipcFailureToken = randomUUID()

export function getIpcFailureToken(): string {
    return ipcFailureToken
}

const NOTIFY_ON_ERROR_CHANNELS = new Set([
    'fs:writeFile',
    'fs:writeJSON',
    'fs:copy',
    'fs:rimraf',
    'fs:rename',
    'fs:ensure',
    'fs:extractZip',
    'file:archiveFiles',
    'file:archiveForPublish',
    'servers:read',
    'servers:write',
    'version:save',
    'shell:openPath',
    'accounts:load',
    'accounts:save'
])

function describeIpcError(err: unknown): unknown {
    if (err && typeof err === 'object') {
        const anyErr = err as any
        if (anyErr.isAxiosError) {
            return {
                message: anyErr.message,
                status: anyErr.response?.status,
                method: anyErr.config?.method,
                url: anyErr.config?.url
            }
        }
        if (anyErr instanceof Error) {
            return `${anyErr.name}: ${anyErr.message}`
        }
    }
    return err
}

function sanitizeFailure(failure: FailureInfo): FailureInfo {
    return {
        ...failure,
        message: redactSecrets(failure.message),
        url: failure.url ? redactSecrets(failure.url.split('?')[0]) : undefined
    }
}

export class IpcArgumentError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'IpcArgumentError'
    }
}

export type ArgCheck = (value: unknown) => boolean

const MAX_IPC_STRING_LENGTH = 8192

export const check = {
    string(maxLength = MAX_IPC_STRING_LENGTH): ArgCheck {
        return (value) =>
            typeof value === 'string' && value.length <= maxLength && !value.includes('\0')
    },
    nonEmptyString(maxLength = MAX_IPC_STRING_LENGTH): ArgCheck {
        const isString = check.string(maxLength)
        return (value) => isString(value) && (value as string).length > 0
    },
    pattern(expression: RegExp, maxLength = MAX_IPC_STRING_LENGTH): ArgCheck {
        const isString = check.string(maxLength)
        return (value) => isString(value) && expression.test(value as string)
    },
    number(): ArgCheck {
        return (value) => typeof value === 'number' && Number.isFinite(value)
    },
    integer(): ArgCheck {
        return (value) => typeof value === 'number' && Number.isSafeInteger(value)
    },
    object(maxKeys = 256): ArgCheck {
        return (value) =>
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value) &&
            Object.keys(value).length <= maxKeys
    },
    boolean(): ArgCheck {
        return (value) => typeof value === 'boolean'
    },
    oneOf(...allowed: readonly (string | number)[]): ArgCheck {
        const set = new Set<unknown>(allowed)
        return (value) => set.has(value)
    },
    arrayOf(item: ArgCheck, maxLength = 1000): ArgCheck {
        return (value) =>
            Array.isArray(value) && value.length <= maxLength && value.every(item)
    },
    optional(inner: ArgCheck): ArgCheck {
        return (value) => value === undefined || value === null || inner(value)
    },
    any(): ArgCheck {
        return () => true
    }
}

function assertArgs(channel: string, checks: ArgCheck[], args: unknown[]): void {
    for (let index = 0; index < checks.length; index++) {
        if (checks[index](args[index])) continue
        throw new IpcArgumentError(`Refused ${channel}: argument ${index} is not allowed`)
    }
}

type Handler<TResult, TArgs extends any[]> = (
    event: IpcMainInvokeEvent,
    ...args: TArgs
) => Promise<TResult> | TResult

type Fallback<TResult, TArgs extends any[]> =
    | TResult
    | null
    | undefined
    | ((...args: TArgs) => TResult | null | undefined)

export function handleSafe<TResult, TArgs extends any[] = any[]>(
    channel: string,
    handler: Handler<TResult, TArgs>
): void
export function handleSafe<TResult, TArgs extends any[] = any[]>(
    channel: string,
    fallback: Fallback<TResult, TArgs>,
    handler: Handler<TResult, TArgs>
): void
export function handleSafe<TResult, TArgs extends any[] = any[]>(
    channel: string,
    fallback: Fallback<TResult, TArgs>,
    checks: ArgCheck[],
    handler: Handler<TResult, TArgs>
): void

export function handleSafe<TResult, TArgs extends any[] = any[]>(
    channel: string,
    fallbackOrHandler: Fallback<TResult, TArgs> | Handler<TResult, TArgs>,
    checksOrHandler?: ArgCheck[] | Handler<TResult, TArgs>,
    maybeHandler?: Handler<TResult, TArgs>
) {
    const checks = Array.isArray(checksOrHandler) ? checksOrHandler : []
    const handler = (maybeHandler ??
        (Array.isArray(checksOrHandler) ? undefined : checksOrHandler) ??
        fallbackOrHandler) as Handler<TResult, TArgs>
    const fallback = (checksOrHandler !== undefined ? fallbackOrHandler : undefined) as
        | Fallback<TResult, TArgs>
        | undefined

    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args: TArgs) => {
        try {
            assertArgs(channel, checks, args)
            return await handler(event, ...args)
        } catch (err) {
            const isPathRefusal = err instanceof PathPolicyError
            const isRefused = isPathRefusal || err instanceof IpcArgumentError
            const described = describeIpcError(err)
            console.error(
                isRefused ? `[IPC][policy] ${channel} refused:` : `[IPC] ${channel} error:`,
                described
            )

            const failure = sanitizeFailure(
                isRefused
                    ? {
                          ...classifyError(err, { channel, side: 'launcher' }),
                          cause: isPathRefusal ? 'pathPolicy' : 'invalidArgument',
                          code: isPathRefusal ? 'APP-PATHPOLICY' : 'APP-BADARG'
                      }
                    : classifyError(err, { channel })
            )
            console.error(`[IPC] ${channel} classified as ${failure.code}`)

            const value =
                typeof fallback === 'function' ? (fallback as any)(...args) : fallback

            return wrapIpcFailure(
                ipcFailureToken,
                {
                    channel,
                    notify: !isRefused && NOTIFY_ON_ERROR_CHANNELS.has(channel),
                    failure,
                    message: failure.message
                },
                value
            )
        }
    })
}
