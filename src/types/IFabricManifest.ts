export interface IFabricManifest {
  id: string
  inheritsFrom: string
  releaseTime: string
  time: string
  type: string
  mainClass: string
  arguments: {
    game: string[]
    jvm: string[]
  }
  libraries: {
    name: string
    url: string
    sha1: string
    size: number
  }[]
}
