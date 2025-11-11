import { getOS } from '@renderer/utilities/Other'

const api = window.api
const path = api.path
const getPath = api.getPath
const fs = api.fs
const startDownload = api.startDownload

interface IJava {
  version: number
  id: string
  windows: IJavaFile
  osx: IJavaFile
  linux: IJavaFile
}

interface IJavaFile {
  url: string
  file: string
}

export class Java {
  public javaPath: string = ''
  public javaServerPath: string = ''
  public majorVersion: number = 21
  private version: IJava | undefined

  private versionsJava: IJava[] = [
    {
      version: 21,
      id: 'jdk-21.0.5+11',
      windows: {
        url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip',
        file: 'OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip'
      },
      osx: {
        url: '',
        file: ''
      },
      linux: {
        url: '',
        file: ''
      }
    },
    {
      version: 17,
      id: 'jdk-17.0.10+7',
      windows: {
        url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.zip',
        file: 'OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.zip'
      },
      osx: {
        url: '',
        file: ''
      },
      linux: {
        url: '',
        file: ''
      }
    },
    {
      version: 16,
      id: 'jdk-16.0.2+7',
      windows: {
        url: 'https://github.com/adoptium/temurin16-binaries/releases/download/jdk-16.0.2%2B7/OpenJDK16U-jdk_x64_windows_hotspot_16.0.2_7.zip',

        file: 'OpenJDK16U-jdk_x64_windows_hotspot_16.0.2_7.zip'
      },
      osx: {
        url: '',
        file: ''
      },
      linux: {
        url: '',
        file: ''
      }
    },
    {
      version: 8,
      id: 'jdk8u402-b06-jre',
      windows: {
        url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u402-b06/OpenJDK8U-jre_x64_windows_hotspot_8u402b06.zip',
        file: 'OpenJDK8U-jre_x64_windows_hotspot_8u402b06.zip'
      },
      osx: {
        url: '',
        file: ''
      },
      linux: {
        url: '',
        file: ''
      }
    }
  ]

  constructor(version: number) {
    this.majorVersion = version
    this.version = this.versionsJava.find((v) => v.version === version)
  }

  async init() {
    if (!this.version) return

    const os = getOS()

    const javaPath = path.join(
      await getPath('appData'),
      '.grubielauncher',
      'java',
      this.version.id,
      'bin'
    )

    const ext = os === 'windows' ? '.exe' : ''

    this.javaPath = path.join(javaPath, 'javaw' + ext)
    this.javaServerPath = path.join(javaPath, 'java' + ext)
  }

  async install() {
    if (!this.version) return

    const os = getOS()

    try {
      await fs.access(this.javaPath)
      return
    } catch (error) {}

    const osJava = this.version[os]

    await startDownload([
      {
        url: osJava.url,
        destination: path.join(await getPath('appData'), '.grubielauncher', 'java', osJava.file),
        group: 'java',
        options: { extract: true }
      }
    ])
  }
}
