import { IServerSettings } from '@/types/Server'

const api = window.api
const fs = api.fs
const path = api.path

export function replaceXmxParameter(serverPath: string, memory: string) {
  function replace(data: string, memory: string): string {
    return data.replace(/-Xmx\d+[MG]/, `-Xmx${memory}`)
  }

  function edit(filePath: string, memory: string) {
    if (fs.pathExistsSync(filePath)) {
      let data = fs.readFileSync(filePath, 'utf-8')
      if (data.includes('-Xmx')) {
        data = replace(data, memory)
        fs.writeFileSync(filePath, data, 'utf-8')
      }
    }
  }

  const batPath = path.join(serverPath, 'run.bat')
  const shPath = path.join(serverPath, 'run.sh')
  const jvmArgs = path.join(serverPath, 'user_jvm_args.txt')

  edit(batPath, memory)
  edit(shPath, memory)
  edit(jvmArgs, memory)
}

export function updateServerProperty(filePath: string, settings: IServerSettings): void {
  const fileContent = fs.readFileSync(filePath, 'utf8')

  const lines = fileContent.split('\n')

  let updatedLines = [...lines]

  function update(property: string, value: string | number | boolean) {
    let updated = false

    updatedLines = updatedLines.map((line) => {
      if (line.trim().startsWith('#') || line.trim() === '') {
        return line
      }

      const [key] = line.split('=')
      const currentKey = key.trim()

      if (currentKey === property) {
        updated = true
        return `${currentKey}=${value}`
      }

      return line
    })

    if (!updated) {
      updatedLines.push(`${property}=${value}`)
    }
  }

  update('max-players', settings.maxPlayers)
  update('gamemode', settings.gameMode)
  update('difficulty', settings.difficulty)
  update('white-list', settings.whitelist)
  update('online-mode', settings.onlineMode)
  update('pvp', settings.pvp)
  update('enable-command-block', settings.enableCommandBlock)
  update('allow-flight', settings.allowFlight)
  update('spawn-animals', settings.spawnAnimals)
  update('spawn-monsters', settings.spawnMonsters)
  update('spawn-npcs', settings.spawnNpcs)
  update('allow-nether', settings.allowNether)
  update('force-gamemode', settings.forceGamemode)
  update('spawn-protection', settings.spawnProtection)
  update('require-resource-pack', settings.requireResourcePack)
  update('resource-pack', settings.resourcePack)
  update('resource-pack-prompt', settings.resourcePackPrompt)
  update('motd', settings.motd)
  update('server-ip', settings.serverIp)
  update('server-port', settings.serverPort)

  fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf8')
}

export function getServerSettings(filePath: string): IServerSettings {
  const fileContent = fs.readFileSync(filePath, 'utf8')
  const lines = fileContent.split('\n')

  function getServerProperty(property: string) {
    for (const line of lines) {
      if (line.trim().startsWith('#') || line.trim() === '') {
        continue
      }

      const [key, ...rest] = line.split('=')
      const currentKey = key.trim()
      const currentValue = rest.join('=').trim()

      if (currentKey === property) {
        return currentValue
      }
    }

    return null
  }

  return {
    maxPlayers: Number(getServerProperty('max-players') || 20),
    gameMode: getServerProperty('gamemode') || 'survival',
    difficulty: getServerProperty('difficulty') || 'normal',
    whitelist: getServerProperty('white-list') === 'true',
    onlineMode: getServerProperty('online-mode') === 'true',
    pvp: getServerProperty('pvp') === 'true',
    enableCommandBlock: getServerProperty('enable-command-block') === 'true',
    allowFlight: getServerProperty('allow-flight') === 'true',
    spawnAnimals: getServerProperty('spawn-animals') === 'true',
    spawnMonsters: getServerProperty('spawn-monsters') === 'true',
    spawnNpcs: getServerProperty('spawn-npcs') === 'true',
    allowNether: getServerProperty('allow-nether') === 'true',
    forceGamemode: getServerProperty('force-gamemode') === 'true',
    spawnProtection: Number(getServerProperty('spawn-protection') || 16),
    requireResourcePack: getServerProperty('require-resource-pack') === 'true',
    resourcePack: getServerProperty('resource-pack') || '',
    resourcePackPrompt: getServerProperty('resource-pack-prompt') || '',
    motd: getServerProperty('motd') || '',
    serverIp: getServerProperty('server-ip') || '',
    serverPort: Number(getServerProperty('server-port') || 25565)
  }
}
