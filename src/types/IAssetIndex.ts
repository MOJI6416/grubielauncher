export interface IAssetIndex {
  objects: {
    [key: string]: {
      hash: string
      size: number
    }
  }
}
