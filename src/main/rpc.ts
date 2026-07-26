import type { RPC } from './utilities/rpc'

type RpcMethod = keyof RPC

let instance: RPC | null = null
let loading: Promise<RPC> | null = null

async function ensureRpc(): Promise<RPC> {
  if (instance) return instance
  if (!loading) {
    loading = import('./utilities/rpc')
      .then(({ RPC: RpcClass }) => {
        instance = new RpcClass()
        loading = null
        return instance
      })
      .catch((error) => {
        loading = null
        throw error
      })
  }

  return loading
}

function forward<K extends RpcMethod>(method: K) {
  return (...args: Parameters<Extract<RPC[K], (...args: never) => unknown>>) => {
    return ensureRpc()
      .then((target) =>
        (target[method] as (...callArgs: unknown[]) => unknown)(...args)
      )
      .catch((error) => {
        console.warn(`Discord RPC ${String(method)} failed`, error)
      })
  }
}

export const rpc = {
  login: forward('login'),
  dispose: async () => {
    if (!instance && !loading) return
    await forward('dispose')()
  },
  syncContext: forward('syncContext'),
  setShareState: forward('setShareState'),
  setGameLaunching: forward('setGameLaunching'),
  setGamePlaying: forward('setGamePlaying'),
  updateGameServer: forward('updateGameServer'),
  clearGameContext: forward('clearGameContext')
}
