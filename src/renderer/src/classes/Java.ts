const api = window.api

export class Java {
  public javaPath: string = ''
  public majorVersion: number

  constructor(version: number) {
    this.majorVersion = version
  }

  public async init() {
    this.javaPath = await api.java.getPath(this.majorVersion)
  }

  public async install() {
    await api.java.install(this.majorVersion)
    await this.init()
  }
}
