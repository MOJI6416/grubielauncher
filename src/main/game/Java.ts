import { IArch, IPlatform } from '@/types/OS'
import { app } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { Downloader } from '../utilities/downloader'
import { getOS } from '../utilities/other'

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
  size: number
  sha1: string
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
          url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_x64_windows_hotspot_21.0.8_9.zip',
          size: 204850009,
          sha1: 'b30ddedf02ce94bd32e5e4b92b4d4c1cb7229259'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_aarch64_windows_hotspot_21.0.8_9.zip',
          size: 191992920,
          sha1: '7097456ef6a8dde4c1744ab9732441ec190c90d7'
        }
      ],
      osx: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_x64_mac_hotspot_21.0.8_9.tar.gz',
          size: 194046408,
          sha1: '03b4305e7c52aa37e856f1dffaff4015b738920f'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.8_9.tar.gz',
          size: 199817579,
          sha1: '880b478db959f95276a2cdfc4651f6c3583c7451'
        }
      ],
      linux: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_x64_linux_hotspot_21.0.8_9.tar.gz',
          size: 207098019,
          sha1: '1aa50043e45d4d308d6935a7e4a03872a3b5cb04'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jdk_aarch64_linux_hotspot_21.0.8_9.tar.gz',
          size: 205275133,
          sha1: '63cb34bf2856b9865a2d636ea2f31bdcc48d525b'
        }
      ]
    },
    {
      version: 17,
      id: 'jdk-17.0.16+8',
      windows: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.16%2B8/OpenJDK17U-jdk_x64_windows_hotspot_17.0.16_8.zip',
          size: 190520081,
          sha1: '64a54dd06e8921e05bcfb570628cb4a6c169bd3e'
        }
      ],
      osx: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.16%2B8/OpenJDK17U-jdk_x64_mac_hotspot_17.0.16_8.tar.gz',
          size: 180154703,
          sha1: 'ab0e548991ea2434b93beca92aad0bce778d7b92'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.16%2B8/OpenJDK17U-jdk_aarch64_mac_hotspot_17.0.16_8.tar.gz',
          size: 185444095,
          sha1: 'a182029c634557ac731f670a72932d9a53ee139e'
        }
      ],
      linux: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.16%2B8/OpenJDK17U-jdk_x64_linux_hotspot_17.0.16_8.tar.gz',
          size: 192062472,
          sha1: '09b9bd71fc47f37d75ec7ba9eb6c8541c9a5b474'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.16%2B8/OpenJDK17U-jdk_aarch64_linux_hotspot_17.0.16_8.tar.gz',
          size: 190777911,
          sha1: 'db76a7ad08287715f932ac3ea98c43b2111521a0'
        }
      ]
    },
    {
      version: 16,
      id: 'jdk-16.0.2+7',
      windows: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin16-binaries/releases/download/jdk-16.0.2%2B7/OpenJDK16U-jdk_x64_windows_hotspot_16.0.2_7.zip',
          size: 203448494,
          sha1: '3171b4bb3c7a8a5a0749d68c9343f9e2efb04ed9'
        }
      ],
      osx: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin16-binaries/releases/download/jdk-16.0.2%2B7/OpenJDK16U-jdk_x64_mac_hotspot_16.0.2_7.tar.gz',
          size: 206621395,
          sha1: 'd4517e4dcb555ac3e517bcff9a3f2798222b4f4c'
        }
      ],
      linux: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin16-binaries/releases/download/jdk-16.0.2%2B7/OpenJDK16U-jdk_x64_linux_hotspot_16.0.2_7.tar.gz',
          size: 205463525,
          sha1: '7da16d37a9634076f16476579e74f64a7ffd347a'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin16-binaries/releases/download/jdk-16.0.2%2B7/OpenJDK16U-jdk_aarch64_linux_hotspot_16.0.2_7.tar.gz',
          size: 203084034,
          sha1: 'e5bfb83c6cf3e7e979e1660c2152c33c1722be20'
        }
      ]
    },
    {
      version: 8,
      id: 'jdk8u462-b08',
      windows: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u462-b08/OpenJDK8U-jdk_x64_windows_hotspot_8u462b08.zip',
          size: 106969643,
          sha1: '0395a0bcfc99a1eaad9ab191c51a1a104a9fe285'
        }
      ],
      osx: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u462-b08/OpenJDK8U-jdk_x64_mac_hotspot_8u462b08.tar.gz',
          size: 109572785,
          sha1: 'd982110214a16d88699fcae369e8a0aabd399dd2'
        }
      ],
      linux: [
        {
          name: 'x64',
          url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u462-b08/OpenJDK8U-jdk_x64_linux_hotspot_8u462b08.tar.gz',
          size: 103087414,
          sha1: 'd44e52bcd332b6d8be54ff4d1b81768891d8f01a'
        },
        {
          name: 'arm64',
          url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u462-b08/OpenJDK8U-jdk_aarch64_linux_hotspot_8u462b08.tar.gz',
          size: 102210204,
          sha1: 'ea004e11ff421b1bd0825048ca5b43950921aa4b'
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
      app.getPath('appData'),
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

    const downloader = new Downloader()

    await downloader.downloadFiles([
      {
        url: javaFile.url,
        destination: path.join(app.getPath('appData'), '.grubielauncher', 'java', fileName),
        sha1: javaFile.sha1,
        size: javaFile.size,
        group: 'java',
        options: { extract: true }
      }
    ])
  }
}
