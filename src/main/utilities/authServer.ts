import express, { Request, Response } from 'express'
import { Server } from 'http'

let serverInstance: Server | null = null
let pendingReject: ((err: Error) => void) | null = null
const OAUTH_TIMEOUT_MS = 2 * 60 * 1000

function parseExpectedState(expectedState: string): 'microsoft' | 'discord' | 'elyby' {
  const [provider, nonce] = expectedState.split(':', 2)

  if (!nonce || !/^[a-zA-Z0-9-]{16,}$/.test(nonce)) {
    throw new Error('Invalid OAuth state.')
  }

  if (provider === 'microsoft' || provider === 'discord' || provider === 'elyby') {
    return provider
  }

  throw new Error('Invalid OAuth provider.')
}

function closeServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!serverInstance) return resolve()

    const s = serverInstance
    serverInstance = null

    try {
      s.close(() => resolve())
    } catch {
      resolve()
    }
  })
}

export async function stopOAuthServer(reason = 'OAuth server was stopped.'): Promise<void> {
  const rejectPending = pendingReject
  pendingReject = null

  await closeServer()

  rejectPending?.(new Error(reason))
}

export function startOAuthServer(expectedState: string): Promise<{
  code: string
  provider: 'microsoft' | 'discord' | 'elyby'
}> {
  return new Promise((resolve, reject) => {
    let settled = false
    let timeoutId: NodeJS.Timeout | null = null
    let expectedProvider: 'microsoft' | 'discord' | 'elyby'

    try {
      expectedProvider = parseExpectedState(expectedState)
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }

    const safeResolve = (data: { code: string; provider: 'microsoft' | 'discord' | 'elyby' }) => {
      if (settled) return
      settled = true
      if (timeoutId) clearTimeout(timeoutId)
      pendingReject = null
      resolve(data)
    }

    const safeReject = (err: Error) => {
      if (settled) return
      settled = true
      if (timeoutId) clearTimeout(timeoutId)
      pendingReject = null
      reject(err)
    }

    ;(async () => {
      if (pendingReject) {
        pendingReject(new Error('OAuth server was restarted.'))
      }

      pendingReject = safeReject

      await closeServer()

      const app = express()
      timeoutId = setTimeout(async () => {
        await closeServer()
        safeReject(new Error('OAuth callback timed out.'))
      }, OAUTH_TIMEOUT_MS)

      app.get('/callback', async (req: Request, res: Response) => {
        const codeParam = req.query.code?.toString()
        const stateParam = req.query.state

        const code = Array.isArray(codeParam) ? codeParam[0] : (codeParam as string | undefined)
        const state = Array.isArray(stateParam) ? stateParam[0] : (stateParam as string | undefined)
        const isValidState = state === expectedState

        if (!code || !isValidState) {
          res.redirect('https://grubielauncher.com/auth/failed')
          await closeServer()
          return safeReject(new Error('Invalid request. Missing code or OAuth state.'))
        }

        res.redirect('https://grubielauncher.com/auth/success')

        await closeServer()

        safeResolve({
          code,
          provider: expectedProvider
        })
      })

      serverInstance = app.listen(53213, 'localhost')

      serverInstance.on('error', async (err: any) => {
        await closeServer()
        safeReject(err instanceof Error ? err : new Error(String(err)))
      })
    })().catch((err) => safeReject(err instanceof Error ? err : new Error(String(err))))
  })
}
