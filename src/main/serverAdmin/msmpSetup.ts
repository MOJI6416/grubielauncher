import { randomBytes } from 'crypto'
import { execFile } from 'child_process'
import fs from 'fs-extra'
import net from 'net'
import path from 'path'

export const MSMP_HOST = '127.0.0.1'
export const MSMP_STATE_DIR = path.join('storage', 'management')
export const MSMP_KEYSTORE_FILE = 'management.p12'
export const MSMP_STATE_FILE = 'state.json'
export const MSMP_PASSWORD_ENV = 'MINECRAFT_MANAGEMENT_TLS_KEYSTORE_PASSWORD'

const SECRET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export type MsmpFallbackReason = 'old_version' | 'disabled' | 'connect_failed'

export interface MsmpProperties {
  enabled: boolean
  host: string
  port: number
  secret: string
  tlsEnabled: boolean
  keystore: string
}

export interface MsmpState {
  secret: string
  port: number
  keystorePassword?: string
  fingerprint256?: string
}

export interface MsmpPlan {
  host: string
  port: number
  secret: string
  tls: boolean
  fingerprint256?: string
  env: Record<string, string>
  managed: boolean
}

export function generateMsmpSecret(): string {
  const bytes = randomBytes(40)
  let secret = ''
  for (const byte of bytes) secret += SECRET_ALPHABET[byte % SECRET_ALPHABET.length]
  return secret
}

export function isValidMsmpSecret(value: string): boolean {
  return /^[A-Za-z0-9]{40}$/.test(value)
}

export function supportsMsmpVersion(versionId: string | null | undefined): boolean {
  const id = (versionId ?? '').trim().toLowerCase()
  if (!id) return false

  const snapshot = /^(\d{2})w(\d{2})[a-z]$/.exec(id)
  if (snapshot) {
    const year = Number(snapshot[1])
    const week = Number(snapshot[2])
    return year > 25 || (year === 25 && week >= 35)
  }

  const release = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(id)
  if (!release) return false
  const major = Number(release[1])
  const minor = Number(release[2])
  const patch = Number(release[3] ?? 0)
  if (major !== 1) return major >= 25
  if (minor !== 21) return minor > 21
  return patch >= 9
}

function unescapeValue(value: string): string {
  return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, sequence: string) => {
    if (sequence[0] === 'u') return String.fromCharCode(Number.parseInt(sequence.slice(1), 16))
    if (sequence === 'n') return '\n'
    if (sequence === 't') return '\t'
    if (sequence === 'r') return '\r'
    return sequence
  })
}

export function readProperty(text: string, key: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trimStart()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
    const match = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(trimmed)
    if (match && match[1] === key) return unescapeValue(match[2].trim())
  }
  return null
}

export function readMsmpProperties(text: string): MsmpProperties {
  return {
    enabled: readProperty(text, 'management-server-enabled') === 'true',
    host: readProperty(text, 'management-server-host') || 'localhost',
    port: Number(readProperty(text, 'management-server-port') || 0),
    secret: readProperty(text, 'management-server-secret') || '',
    tlsEnabled: readProperty(text, 'management-server-tls-enabled') !== 'false',
    keystore: readProperty(text, 'management-server-tls-keystore') || '',
  }
}

export function writeProperties(text: string, values: Record<string, string>): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text ? text.split(/\r?\n/) : []
  const pending = new Map(Object.entries(values))

  const next = lines.map((line) => {
    const trimmed = line.trimStart()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return line
    const match = /^([^=:\s]+)\s*[=:]/.exec(trimmed)
    if (!match || !pending.has(match[1])) return line
    const value = pending.get(match[1]) as string
    pending.delete(match[1])
    return `${match[1]}=${value}`
  })

  if (next.length > 0 && next[next.length - 1] === '') next.pop()
  for (const [key, value] of pending) next.push(`${key}=${value}`)
  return `${next.join(eol)}${eol}`
}

export function isUserManagedMsmp(
  properties: MsmpProperties,
  state: MsmpState | null,
): boolean {
  if (!properties.enabled || !properties.secret) return false
  return properties.secret !== state?.secret
}

export function buildManagedProperties(options: {
  port: number
  secret: string
  tls: boolean
}): Record<string, string> {
  const values: Record<string, string> = {
    'management-server-enabled': 'true',
    'management-server-host': MSMP_HOST,
    'management-server-port': String(options.port),
    'management-server-secret': options.secret,
    'management-server-tls-enabled': String(options.tls),
    'management-server-allowed-origins': 'grubie-launcher',
  }
  if (options.tls) {
    values['management-server-tls-keystore'] = `${MSMP_STATE_DIR.replace(/\\/g, '/')}/${MSMP_KEYSTORE_FILE}`
  }
  return values
}

export function freePort(host = MSMP_HOST): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, host, () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
  })
}

export function isPortFree(port: number, host = MSMP_HOST): Promise<boolean> {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return Promise.resolve(false)
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen(port, host, () => server.close(() => resolve(true)))
  })
}

function run(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout) => {
      if (error) reject(error)
      else resolve(String(stdout))
    })
  })
}

export function keytoolFor(javaPath: string): string {
  const name = process.platform === 'win32' ? 'keytool.exe' : 'keytool'
  return path.join(path.dirname(javaPath), name)
}

export function fingerprintFromKeytool(output: string): string | null {
  const match = /SHA-?256:\s*([0-9A-F:]{95})/i.exec(output)
  return match ? match[1].toUpperCase() : null
}

export async function ensureKeystore(
  serverPath: string,
  javaPath: string,
  state: MsmpState | null,
): Promise<{ password: string; fingerprint256: string } | null> {
  const keystore = path.join(serverPath, MSMP_STATE_DIR, MSMP_KEYSTORE_FILE)
  if (
    state?.keystorePassword &&
    state.fingerprint256 &&
    (await fs.pathExists(keystore))
  ) {
    return { password: state.keystorePassword, fingerprint256: state.fingerprint256 }
  }

  const keytool = keytoolFor(javaPath)
  if (!(await fs.pathExists(keytool))) return null

  const password = generateMsmpSecret()
  await fs.ensureDir(path.dirname(keystore))
  await fs.remove(keystore).catch(() => undefined)

  try {
    await run(
      keytool,
      [
        '-genkeypair',
        '-alias', 'grubie-management',
        '-keyalg', 'RSA',
        '-keysize', '2048',
        '-storetype', 'PKCS12',
        '-keystore', keystore,
        '-storepass', password,
        '-keypass', password,
        '-validity', '3650',
        '-dname', 'CN=localhost',
        '-ext', 'SAN=dns:localhost,ip:127.0.0.1',
      ],
      30000,
    )
    const listing = await run(
      keytool,
      ['-list', '-v', '-keystore', keystore, '-storepass', password, '-alias', 'grubie-management'],
      15000,
    )
    const fingerprint256 = fingerprintFromKeytool(listing)
    if (!fingerprint256) return null
    return { password, fingerprint256 }
  } catch (error) {
    console.warn('[server:msmp] keytool could not create the management keystore:', error)
    return null
  }
}

export async function readMsmpState(serverPath: string): Promise<MsmpState | null> {
  const raw = await fs
    .readJSON(path.join(serverPath, MSMP_STATE_DIR, MSMP_STATE_FILE))
    .catch(() => null)
  if (!raw || typeof raw !== 'object') return null
  const secret = typeof raw.secret === 'string' ? raw.secret : ''
  const port = Number(raw.port)
  if (!isValidMsmpSecret(secret) || !Number.isInteger(port)) return null
  return {
    secret,
    port,
    keystorePassword: typeof raw.keystorePassword === 'string' ? raw.keystorePassword : undefined,
    fingerprint256: typeof raw.fingerprint256 === 'string' ? raw.fingerprint256 : undefined,
  }
}

export async function writeMsmpState(serverPath: string, state: MsmpState): Promise<void> {
  const file = path.join(serverPath, MSMP_STATE_DIR, MSMP_STATE_FILE)
  await fs.ensureDir(path.dirname(file))
  await fs.writeJSON(file, state, { spaces: 2, mode: 0o600 })
}

export async function prepareMsmp(
  serverPath: string,
  javaPath: string | null,
): Promise<MsmpPlan> {
  const propertiesPath = path.join(serverPath, 'server.properties')
  const text = await fs.readFile(propertiesPath, 'utf8').catch(() => '')
  const properties = readMsmpProperties(text)
  const state = await readMsmpState(serverPath)

  if (isUserManagedMsmp(properties, state)) {
    const host = properties.host === 'localhost' ? MSMP_HOST : properties.host
    return {
      host,
      port: properties.port,
      secret: properties.secret,
      tls: properties.tlsEnabled,
      env: {},
      managed: false,
    }
  }

  const secret = state?.secret && isValidMsmpSecret(state.secret) ? state.secret : generateMsmpSecret()
  const port =
    state?.port && (await isPortFree(state.port)) ? state.port : await freePort()
  const keystore = javaPath ? await ensureKeystore(serverPath, javaPath, state) : null
  const tls = keystore !== null

  await fs.writeFile(
    propertiesPath,
    writeProperties(text, buildManagedProperties({ port, secret, tls })),
    'utf8',
  )
  await writeMsmpState(serverPath, {
    secret,
    port,
    keystorePassword: keystore?.password,
    fingerprint256: keystore?.fingerprint256,
  })

  return {
    host: MSMP_HOST,
    port,
    secret,
    tls,
    fingerprint256: keystore?.fingerprint256,
    env: keystore ? { [MSMP_PASSWORD_ENV]: keystore.password } : {},
    managed: true,
  }
}
