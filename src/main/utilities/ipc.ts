import { ipcMain, IpcMainInvokeEvent } from 'electron'

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
            console.error(`[IPC] ${channel} error:`, err)
            if (typeof fallback === 'function') return (fallback as any)(...args)
            return fallback
        }
    })
}
