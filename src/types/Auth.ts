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
}

export interface IRefreshTokenRequest {
  refreshToken: string
  id: string
}
