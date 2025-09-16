import { ICreateUser } from '@/types/IUser'
import { Backend } from './Backend'
import axios from 'axios'

const env = window.api.env

const generateOfflineUUID = window.api.generateOfflineUUID

async function getAccessToken(code: string, isRefreshToken: boolean = false) {
  const requestBody = {
    client_id: env.MICROSOFT_CLIENT_ID,
    code: code,
    grant_type: 'authorization_code',
    redirect_uri: 'http://localhost:53213/callback'
  }

  let refreshBody
  if (isRefreshToken) {
    refreshBody = {
      client_id: requestBody.client_id,
      grant_type: 'refresh_token',
      refresh_token: code,
      redirect_uri: requestBody.redirect_uri
    }
  }

  try {
    const response = await axios.post<{
      token_type: string
      expires_in: number
      scope: string
      access_token: string
      refresh_token: string
      user_id: string
      foci: string
    }>(
      'https://login.live.com/oauth20_token.srf',
      new URLSearchParams(!isRefreshToken ? requestBody : refreshBody),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    return response.data
  } catch {
    return null
  }
}

async function signInXbox(rpsTicket: string) {
  try {
    const response = await axios.post<{
      IssueInstant: string
      NotAfter: string
      Token: string
      DisplayClaims: {
        xui: { uhs: string }[]
      }
    }>('https://user.auth.xboxlive.com/user/authenticate', {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${rpsTicket}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })

    return {
      uhs: response.data.DisplayClaims.xui[0].uhs,
      token: response.data.Token
    }
  } catch {
    return null
  }
}

async function getXSTSToken(token: string): Promise<string | null> {
  try {
    const response = await axios.post<{
      IssueInstant: string
      NotAfter: string
      Token: string
      DisplayClaims: { xui: { uhs: string }[] }
    }>('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [token]
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })

    return response.data.Token
  } catch {
    return null
  }
}

async function getMinecraftToken(userHash: string, XSTSToken: string) {
  try {
    const response = await axios.post<{
      username: string
      roles: string[]
      access_token: string
      token_type: string
      expires_in: number
    }>('https://api.minecraftservices.com/authentication/login_with_xbox', {
      identityToken: `XBL3.0 x=${userHash};${XSTSToken}`,
      ensureLegacyEnabled: true
    })

    return response.data
  } catch {
    return null
  }
}

export async function authMicrosoft(
  code: string,
  isRefreshToken: boolean = false,
  id?: string,
  authToken?: string
) {
  const accessToken = await getAccessToken(code, isRefreshToken)

  if (!accessToken) return

  const xbox = await signInXbox(accessToken.access_token)

  if (!xbox) return

  const XSTSToken = await getXSTSToken(xbox.token)

  if (!XSTSToken) return

  const minecraftToken = await getMinecraftToken(xbox.uhs, XSTSToken)

  if (!minecraftToken) return

  const data = {
    accessToken: minecraftToken.access_token,
    refreshToken: accessToken.refresh_token,
    expiresAt: Date.now() + minecraftToken.expires_in * 1000,
    createdAt: Date.now()
  }

  const backend = new Backend()

  if (isRefreshToken && id) {
    const jwtToken = await backend.login(id, data)
    if (!jwtToken) return

    return { accessToken: jwtToken }
  }

  const mojangUser = await getMojangUser(minecraftToken.access_token)

  if (!mojangUser) return

  let dbUser = await backend.getUser(mojangUser.id)

  if (!dbUser) {
    const newUser: ICreateUser = {
      nickname: mojangUser.name,
      platform: 'microsoft',
      uuid: mojangUser.id
    }

    dbUser = await backend.createUser(newUser)
  } else {
    if (dbUser.nickname != mojangUser.name && authToken) {
      backend.setAccessToken(authToken)
      await backend.updateUser(dbUser.uuid, { nickname: mojangUser.name })
    }
  }

  let jwtToken: string | null = null
  if (dbUser) {
    jwtToken = await backend.login(dbUser._id, data)
  }

  if (!jwtToken) return

  return {
    nickname: mojangUser.name,
    accessToken: jwtToken,
    image: dbUser?.image || ''
  }
}

async function getMojangUser(access_token: string) {
  try {
    const response = await axios.get<{
      name: string
      id: string
    }>('https://api.minecraftservices.com/minecraft/profile', {
      headers: { Authorization: 'Bearer ' + access_token }
    })

    return response.data
  } catch {
    return null
  }
}

async function elyByToken(code: string, isRefreshToken = false) {
  const data = {
    client_id: env.ELYBY_CLIENT_ID,
    client_secret: env.ELYBY_CLIENT_SECRET,
    scope: ['offline_access', 'account_info', 'minecraft_server_session']
  }

  if (isRefreshToken) {
    data['refresh_token'] = code
    data['grant_type'] = 'refresh_token'
  } else {
    data['grant_type'] = 'authorization_code'
    data['code'] = code
    data['redirect_uri'] = 'http://localhost:53213/callback'
  }

  try {
    const response = await axios.post<{
      access_token: string
      refresh_token: string
      token_type: string
      expires_in: number
    }>('https://account.ely.by/api/oauth2/v1/token', data)

    return response.data
  } catch {
    return null
  }
}

async function getElyByUser(accessToken: string) {
  try {
    const response = await axios.get<{
      id: number
      uuid: string
      username: string
      registeredAt: number
      profileLink: string
      preferredLanguage: string
      email: string
    }>('https://account.ely.by/api/account/v1/info', {
      headers: {
        Authorization: 'Bearer ' + accessToken
      }
    })

    return response.data
  } catch {
    return null
  }
}

export async function authElyBy(
  code: string,
  isRefreshToken = false,
  id?: string,
  authToken?: string
) {
  try {
    const token = await elyByToken(code, isRefreshToken)
    if (!token) return null

    let backend = new Backend()

    const data = {
      accessToken: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      refreshToken: token.refresh_token,
      createdAt: Date.now()
    }

    if (isRefreshToken && id) {
      const jwtToken = await backend.login(id, data)
      if (!jwtToken) return null

      return { accessToken: jwtToken }
    }

    const user = await getElyByUser(token.access_token)
    if (!user) return null

    let dbUser = await backend.getUser(user.uuid)

    if (!dbUser) {
      const newUser: ICreateUser = {
        nickname: user.username,
        platform: 'elyby',
        uuid: user.uuid
      }

      dbUser = await backend.createUser(newUser)
    } else {
      if (dbUser.nickname != user.username && authToken) {
        backend.setAccessToken(authToken)
        await backend.updateUser(dbUser.uuid, { nickname: user.username })
      }
    }

    let jwtToken: string | null = null
    if (dbUser) {
      jwtToken = await backend.login(dbUser._id, data)
    }

    if (!jwtToken) return null

    return {
      nickname: user.username,
      accessToken: jwtToken,
      image: dbUser?.image
    }
  } catch {
    return null
  }
}

async function discordToken(code: string, isRefreshToken = false) {
  const data = {}

  if (isRefreshToken) {
    data['grant_type'] = 'refresh_token'
    data['refresh_token'] = code
  } else {
    data['grant_type'] = 'authorization_code'
    data['code'] = code
    data['redirect_uri'] = 'http://localhost:53213/callback'
  }

  try {
    const response = await axios.post<{
      access_token: string
      refresh_token: string
      token_type: string
      expires_in: number
      scope: string
    }>('https://discord.com/api/v10/oauth2/token', new URLSearchParams(data), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      auth: {
        username: env.DISCORD_CLIENT_ID,
        password: env.DISCORD_CLIENT_PASSWORD
      }
    })

    return response.data
  } catch {
    return null
  }
}

async function getDiscordUser(accessToken: string) {
  try {
    const response = await axios.get<{
      id: string
      username: string
      avatar: string | null
    }>('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: 'Bearer ' + accessToken
      }
    })

    return response.data
  } catch {
    return null
  }
}

export async function authDiscord(
  code: string,
  isRefreshToken = false,
  id?: string,
  authToken?: string
) {
  try {
    const token = await discordToken(code, isRefreshToken)
    if (!token) return null

    let backend = new Backend()

    const data = {
      accessToken: token.access_token,
      expiresAt: token.expires_in,
      refreshToken: token.refresh_token,
      createdAt: Date.now()
    }

    if (isRefreshToken && id) {
      const jwtToken = await backend.login(id, data)
      if (!jwtToken) return null

      return { accessToken: jwtToken }
    }

    const user = await getDiscordUser(token.access_token)
    if (!user) return null

    const uuid = generateOfflineUUID(user.username)
    let dbUser = await backend.getUser(uuid)

    if (!dbUser) {
      const newUser: ICreateUser = {
        nickname: user.username,
        platform: 'discord',
        uuid,
        image: user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          : undefined
      }

      dbUser = await backend.createUser(newUser)
    } else {
      if (dbUser.nickname != user.username && authToken) {
        backend.setAccessToken(authToken)
        await backend.updateUser(dbUser.uuid, { nickname: user.username })
      }
    }

    let jwtToken: string | null = null
    if (dbUser) {
      jwtToken = await backend.login(dbUser._id, data)
    }

    if (!jwtToken) return null

    backend.setAccessToken(jwtToken)
    await backend.discordAuthenticated(user.id)

    return {
      nickname: user.username,
      accessToken: jwtToken,
      image: dbUser?.image
    }
  } catch {
    return null
  }
}
