import { IModpack } from './Backend'
import { IUser } from './IUser'

export type ModpackSort = 'name' | 'downloads' | 'update' | 'newest'

export const modpackTags = [
  'adventure',
  'challenging',
  'combat',
  'lightweight',
  'magic',
  'multiplayer',
  'optimization',
  'quests',
  'technology'
]

export interface ICreateServer {
  address: string
  name: string
  icon: string
  owner: string
  description: string
  tags: string[]
  version: string
  auth: string
  modpack: string | null
}

export interface IServer {
  _id: string
  address: string
  name: string
  icon: string
  owner: IUser
  description: string
  tags: string[]
  version: string
  auth: string
  modpack: IModpack
}

export const serverTags = {
  main: [
    'survival',
    'creative',
    'minigames',
    'pvp',
    'pve',
    'roleplay',
    'economy',
    'politics',
    'adventure',
    'rpg',
    'hardcore',
    'clans',
    'quests'
  ],
  minigames: [
    'bedWars',
    'skyWars',
    'hungerGames',
    'hideAndSeek',
    'tntRun',
    'buildBattle',
    'parkour',
    'skyBlock',
    'luckyBlock',
    'oneBlock'
  ]
}
