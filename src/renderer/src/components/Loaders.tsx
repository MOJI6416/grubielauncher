import { Loader } from '@/types/Loader'
import { Tab, Tabs } from '@heroui/react'

export const loaders = {
  vanilla: {
    name: 'Vanilla',
    style: 'bg-gradient-to-b from-[#6FEE8D] to-[#17c964] text-transparent bg-clip-text'
  },
  forge: {
    name: 'Forge',
    style: 'bg-gradient-to-b from-[#4776E6] to-[#8E54E9] text-transparent bg-clip-text'
  },
  neoforge: {
    name: 'NeoForge',
    style: 'bg-gradient-to-b from-[#FF6B6B] to-[#FF8E53] text-transparent bg-clip-text'
  },
  fabric: {
    name: 'Fabric',
    style: 'bg-gradient-to-b from-[#5A67D8] to-[#4C51BF] text-transparent bg-clip-text'
  },
  quilt: {
    name: 'Quilt',
    style: 'bg-gradient-to-b from-[#9D50BB] to-[#6E48AA] text-transparent bg-clip-text'
  }
}

export function Loaders({
  select,
  isLoading,
  isDisabled = false,
  loader
}: {
  select: (loader: Loader) => void
  isLoading: boolean
  isDisabled?: boolean
  loader: string
}) {
  return (
    <Tabs
      onSelectionChange={(key) => select(key as Loader)}
      isDisabled={isLoading || isDisabled}
      selectedKey={loader}
    >
      <Tab
        className={loaders['vanilla'].style}
        key="vanilla"
        title={<div className={loaders['vanilla'].style}>{loaders['vanilla'].name}</div>}
      ></Tab>
      <Tab
        className={loaders['forge'].style}
        key="forge"
        title={<div className={loaders['forge'].style}>{loaders['forge'].name}</div>}
      ></Tab>
      <Tab
        className={loaders['neoforge'].style}
        key="neoforge"
        title={<div className={loaders['neoforge'].style}>{loaders['neoforge'].name}</div>}
      ></Tab>
      <Tab
        className={loaders['fabric'].style}
        key="fabric"
        title={<div className={loaders['fabric'].style}>{loaders['fabric'].name}</div>}
      ></Tab>
      <Tab
        className={loaders['quilt'].style}
        key="quilt"
        title={<div className={loaders['quilt'].style}>{loaders['quilt'].name}</div>}
      ></Tab>
    </Tabs>
  )
}
