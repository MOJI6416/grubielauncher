export interface IMessage {
  message: {
    _type: 'text' | 'modpack'
    value: string
  }
  sender: string
  time: Date
}
