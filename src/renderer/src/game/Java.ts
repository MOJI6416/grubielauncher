import { IArch, IPlatform } from '@/types/OS'
import { getOS } from '@renderer/utilities/Other'

const api = window.api
const path = api.path
const getPath = api.getPath
const fs = api.fs
const startDownload = api.startDownload

interface IJava {
  version: number
  id: string
  windows: IArchitecture[]
  osx: IArchitecture[]
  linux: IArchitecture[]
}

interface IArchitecture {
  url: string
  name: IArch
}

export class Java {
  public javaPath: string = ''
  public javaServerPath: string = ''
  public majorVersion: number = 21
  private version: IJava | undefined
  public platform: IPlatform | null = null

  private versionsJava: IJava[] = [
    {
      version: 21,
      id: 'jdk-21.0.8+9',
      windows: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_x64_windows_hotspot_21.0.8_9.zip'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_aarch64_windows_hotspot_21.0.8_9.zip'
        }
      ],
      osx: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_x64_mac_hotspot_21.0.8_9.tar.gz'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.8_9.tar.gz'
        }
      ],
      linux: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_x64_linux_hotspot_21.0.8_9.tar.gz'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_aarch64_linux_hotspot_21.0.8_9.tar.gz'
        }
      ]
    },
    {
      version: 17,
      id: 'jdk-17.0.16+8',
      windows: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.16%2B8/OpenJDK17U-jdk_x64_windows_hotspot_17.0.16_8.zip'
        }
      ],
      osx: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.16%2B8/OpenJDK17U-jdk_x64_mac_hotspot_17.0.16_8.tar.gz'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.16%2B8/OpenJDK17U-jdk_aarch64_mac_hotspot_17.0.16_8.tar.gz'
        }
      ],
      linux: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.16%2B8/OpenJDK17U-jdk_x64_linux_hotspot_17.0.16_8.tar.gz'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.16%2B8/OpenJDK17U-jdk_aarch64_linux_hotspot_17.0.16_8.tar.gz'
        }
      ]
    },
    {
      version: 16,
      id: 'jdk-16.0.2+7',
      windows: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin16-binaries/releases/download/jdk-16.0.2%2B7/OpenJDK16U-jdk_x64_windows_hotspot_16.0.2_7.zip'
        }
      ],
      osx: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin16-binaries/releases/download/jdk-16.0.2%2B7/OpenJDK16U-jdk_x64_mac_hotspot_16.0.2_7.tar.gz'
        }
      ],
      linux: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin16-binaries/releases/download/jdk-16.0.2%2B7/OpenJDK16U-jdk_x64_linux_hotspot_16.0.2_7.tar.gz'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin16-binaries/releases/download/jdk-16.0.2%2B7/OpenJDK16U-jdk_aarch64_linux_hotspot_16.0.2_7.tar.gz'
        }
      ]
    },
    {
      version: 8,
      id: 'jdk8u462-b08',
      windows: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u462-b08/OpenJDK8U-jdk_x64_windows_hotspot_8u462b08.zip'
        }
      ],
      osx: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u462-b08/OpenJDK8U-jdk_x64_mac_hotspot_8u462b08.tar.gz'
        }
      ],
      linux: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u462-b08/OpenJDK8U-jdk_x64_linux_hotspot_8u462b08.tar.gz'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u462-b08/OpenJDK8U-jdk_aarch64_linux_hotspot_8u462b08.tar.gz'
        }
      ]
    }
  ]

  constructor(version: number) {
    this.majorVersion = version
    this.version = this.versionsJava.find((v) => v.version === version)
    this.platform = getOS()
  }

  async init() {
    if (!this.version || !this.platform) return

    const javaPath = path.join(
      await getPath('appData'),
      '.grubielauncher',
      'java',
      this.version.id,
      'bin'
    )

    const ext = this.platform.os === 'windows' ? '.exe' : ''

    this.javaPath = path.join(javaPath, 'javaw' + ext)
    this.javaServerPath = path.join(javaPath, 'java' + ext)
  }

  async install() {
    if (!this.version || !this.platform) return

    if (await fs.pathExists(this.javaPath)) return

    const javaFile = this.version[this.platform.os].find((a) => a.name === this.platform!.arch)
    if (!javaFile) return

    const fileName =
      javaFile.url.split('/').pop() || `java.${this.platform.os === 'windows' ? 'zip' : 'tar.gz'}`

    await startDownload([
      {
        url: javaFile.url,
        destination: path.join(await getPath('appData'), '.grubielauncher', 'java', fileName),
        group: 'java',
        options: { extract: true }
      }
    ])
  }
}
