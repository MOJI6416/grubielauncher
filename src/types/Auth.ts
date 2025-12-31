export interface IAuthResponse {
  nickname: string
  accessToken: string
  image?: string
}

export interface IRefreshTokenResponse {
  accessToken: string
}

export interface IAuthRequest {
  code: string
}

export interface IRefreshTokenRequest {
  refreshToken: string
  id: string
}
