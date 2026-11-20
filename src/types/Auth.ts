export interface IAuthResponse {
  nickname: string
  accessToken: string
  refreshToken: string
  image?: string
}

export interface IRefreshTokenResponse {
  accessToken: string
  refreshToken: string
}

export interface IAuthRequest {
  code: string
  codeVerifier?: string
}

export interface IRefreshTokenRequest {
  refreshToken: string
  id: string
}

export interface ILittleSkinProfile {
  id: string
  name: string
}

export interface ILittleSkinSession {
  accessToken: string
  clientToken: string
}

export interface ILittleSkinDeviceCode {
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  expiresIn: number
}

export type LittleSkinSignInResult =
  | { status: 'signedIn'; auth: IAuthResponse }
  | { status: 'chooseProfile'; session: ILittleSkinSession; profiles: ILittleSkinProfile[] }

export interface IOAuthCancelled {
  cancelled: true
  message: string
}
