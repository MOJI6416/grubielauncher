export interface INews {
  title: string
  url: string
  author: string
  image: string
  imageAltText: string
  time: number
  tags: string[]
}

export interface ISponsoredNewsAd {
  id: string
  title: string
  description: string
  cta: string
  image: string
  targetUrl: string
}

export type NewsFeedItem =
  | {
      type: 'news'
      item: INews
    }
  | {
      type: 'sponsored'
      item: ISponsoredNewsAd
    }
