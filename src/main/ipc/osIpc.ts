import os from 'os'
import { handleSafe } from '../utilities/ipc'


export function registerOsIpc() {
  handleSafe<number>('os:totalmem', 0, () => {
    return os.totalmem()
  })
}
