export interface IAssetIndex {
  virtual?: boolean
  map_to_resources?: boolean
  objects: {
    [key: string]: {
      hash: string
      size: number
    }
  }
}
