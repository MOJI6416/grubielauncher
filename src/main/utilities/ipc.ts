import { ipcMain, IpcMainInvokeEvent } from 'electron'

const NOTIFY_ON_ERROR_CHANNELS = new Set([
    'fs:writeFile',
    'fs:writeJSON',
    'fs:move',
    'fs:copy',
    'fs:rimraf',
    'fs:rename',
    'fs:ensure',
    'fs:extractZip',
    'file:archiveFiles'
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
    fallbackOrHandler: Fallback<TResult, TArgs> | Handler<TResult, TArgs>,
    maybeHandler?: Handler<TResult, TArgs>
) {
    const handler = (maybeHandler ?? fallbackOrHandler) as Handler<TResult, TArgs>
    const fallback = (maybeHandler ? fallbackOrHandler : undefined) as
        | Fallback<TResult, TArgs>
        | undefined

    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, ...args: TArgs) => {
        try {
            return await handler(event, ...args)
        } catch (err) {
            const described = describeIpcError(err)
            console.error(`[IPC] ${channel} error:`, described)
            if (NOTIFY_ON_ERROR_CHANNELS.has(channel) && !event.sender.isDestroyed()) {
                event.sender.send('ipc:error', {
                    channel,
                    message:
                        typeof described === 'string'
                            ? described
                            : String((described as any)?.message ?? '')
                })
            }
            if (typeof fallback === 'function') return (fallback as any)(...args)
            return fallback
        }
    })
}
