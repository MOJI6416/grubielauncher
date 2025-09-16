import * as DiscordRPC from 'discord-rpc'

const baseActivity: DiscordRPC.Presence = {
  details: 'Nextgen Minecraft Launcher',
  startTimestamp: new Date(),
  largeImageKey: 'icon',
  largeImageText: 'Grubie Launcher',
  instance: false,
  buttons: [
    { label: 'Download', url: 'https://api.grubielauncher.com/download' },
    { label: 'Discord', url: 'https://discord.gg/URrKha9hk7' }
  ]
}

export class RPC {
  public activity: DiscordRPC.Presence = { ...baseActivity }
  public rpc = new DiscordRPC.Client({ transport: 'ipc' })

  async login() {
    try {
      await this.rpc.login({ clientId: process.env.DISCORD_CLIENT_ID || '' })
      await this.rpc.setActivity(this.activity)
    } catch (error) {
      console.warn(`Failed to connect to Discord RPC:`, error)
    }
  }

  async updateActivity(activity?: DiscordRPC.Presence) {
    if (!activity) this.activity = { ...baseActivity }
    else this.activity = { ...this.activity, ...activity }
    await this.rpc.setActivity(this.activity)
  }
}
