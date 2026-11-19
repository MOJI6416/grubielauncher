import { contextBridge, ipcRenderer } from 'electron'
import type { RtcData, RtcEvent, RtcReply, RtcRequest } from '@/shared/rtcBridge'

contextBridge.exposeInMainWorld('rtcBridge', {
  onRequest: (listener: (request: RtcRequest) => void) => {
    ipcRenderer.on('rtc:request', (_event, request: RtcRequest) => listener(request))
  },
  onSend: (listener: (data: RtcData) => void) => {
    ipcRenderer.on('rtc:send', (_event, data: RtcData) => listener(data))
  },
  reply: (reply: RtcReply) => ipcRenderer.send('rtc:reply', reply),
  event: (event: RtcEvent) => ipcRenderer.send('rtc:event', event),
  data: (data: RtcData) => ipcRenderer.send('rtc:data', data),
  ready: () => ipcRenderer.send('rtc:ready'),
})
