import { rpc } from '../rpc'
import { LanShareService } from './LanShareService'

export const lanShareService = new LanShareService()

rpc.setShareState(lanShareService.getState())

lanShareService.on('stateChanged', (state) => {
  rpc.setShareState(state)
})
