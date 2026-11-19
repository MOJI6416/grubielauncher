import { rpc } from '../rpc'
import { LanShareService } from './LanShareService'
import { DirectGuest } from './directGuest'
import { getDirectPolicy } from './directPolicy'
import { rtcEngine } from './rtcEngine'

export const lanShareService = new LanShareService()
export const directGuest = new DirectGuest(rtcEngine, getDirectPolicy)

export async function disposeShare(): Promise<void> {
  directGuest.closeAll()
  await lanShareService.dispose()
  rtcEngine.dispose()
}

rpc.setShareState(lanShareService.getState())

lanShareService.on('stateChanged', (state) => {
  rpc.setShareState(state)
})
