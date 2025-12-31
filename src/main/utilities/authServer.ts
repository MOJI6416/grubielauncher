import express, { Request, Response } from 'express'
import { Server } from 'http'

let serverInstance: Server | null = null

export function startOAuthServer(): Promise<{
  code: string
  provider: 'microsoft' | 'discord' | 'elyby'
}> {
  return new Promise((resolve, reject) => {
    const app = express()
    if (serverInstance) serverInstance.close()
    serverInstance = app.listen(53213)

    app.get('/callback', (req: Request, res: Response) => {
      const code = req.query.code as string
      const provider = req.query.state as 'microsoft' | 'discord' | 'elyby'

      if (!code || !provider) {
        res.redirect('https://grubielauncher.com/auth/failed')
        return reject(new Error('Invalid request. Missing code or provider.'))
      }

      serverInstance?.close()
      serverInstance = null

      res.redirect('https://grubielauncher.com/auth/success')

      resolve({
        code,
        provider
      })
    })
  })
}
