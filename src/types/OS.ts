export type IOS = 'windows' | 'osx' | 'linux'
export type IArch = 'arm64' | 'x64'
export interface IPlatform {
  os: IOS
  arch: IArch
}
