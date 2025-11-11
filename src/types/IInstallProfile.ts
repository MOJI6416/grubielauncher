export interface IInstallProfile {
  install: {
    filePath: string
  }
  versionInfo: {
    minecraftArguments: string
    mainClass: string
    libraries: {
      name: string
      url?: string
      clientreq?: boolean
      checksums?: string[]
    }[]
  }
}
