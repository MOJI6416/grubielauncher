import { Java } from '../game/Java'
import fs from 'fs-extra'
import { handleSafe } from '../utilities/ipc'

export function registerJavaIpc() {
  handleSafe<string | null>('java:getPath', null, async (_event, majorVersion: number) => {
    const java = new Java(majorVersion)
    await java.init()

    if (await fs.pathExists(java.javaPath)) {
      return java.javaPath
    }

    await java.install()
    return java.javaPath
  })

  handleSafe<string | null>('java:install', null, async (_event, majorVersion: number) => {
    const java = new Java(majorVersion)
    await java.init()
    await java.install()
    return java.javaPath
  })
}
