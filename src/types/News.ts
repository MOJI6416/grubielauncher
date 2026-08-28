export interface INews {
  id?: string
  title: string
  url: string
  author: string
  image: string
  imageAltText: string
  description?: string
  time: number
  tags: string[]
}

export interface INewsPage {
  generatedAt: string
  items: INews[]
  nextCursor: string | null
}

export interface ISponsoredNewsAd {
  id: string
  title: string
  description: string
  cta: string
  image: string
  targetUrl: string
}
