import express, { Request, Response } from 'express'
import { Server } from 'http'

let serverInstance: Server | null = null
let pendingReject: ((err: Error) => void) | null = null

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

export function startOAuthServer(): Promise<{
  code: string
  provider: 'microsoft' | 'discord' | 'elyby'
}> {
  return new Promise((resolve, reject) => {
    let settled = false

    const safeResolve = (data: { code: string; provider: 'microsoft' | 'discord' | 'elyby' }) => {
      if (settled) return
      settled = true
      pendingReject = null
      resolve(data)
    }

    const safeReject = (err: Error) => {
      if (settled) return
      settled = true
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

      app.get('/callback', async (req: Request, res: Response) => {
        const codeParam = req.query.code?.toString()
        const stateParam = req.query.state

        const code = Array.isArray(codeParam) ? codeParam[0] : (codeParam as string | undefined)
        const provider = Array.isArray(stateParam)
          ? stateParam[0]
          : (stateParam as string | undefined)

        const isValidProvider =
          provider === 'microsoft' || provider === 'discord' || provider === 'elyby'

        if (!code || !isValidProvider) {
          res.redirect('https://grubielauncher.com/auth/failed')
          await closeServer()
          return safeReject(new Error('Invalid request. Missing code or provider.'))
        }

        res.redirect('https://grubielauncher.com/auth/success')

        await closeServer()

        safeResolve({
          code,
          provider
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
