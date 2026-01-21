import { Loader } from '@/types/Loader'
import { Tab, Tabs } from '@heroui/react'

export const loaders = {
  vanilla: {
    name: 'Vanilla',
    style: 'bg-gradient-to-b from-[#5CFF6A] to-[#0F3D1F] text-transparent bg-clip-text'
  },

  forge: {
    name: 'Forge',
    style: 'bg-gradient-to-b from-[#DFA86A] to-[#FFFFFF] text-transparent bg-clip-text'
  },

  neoforge: {
    name: 'NeoForge',
    style: 'bg-gradient-to-b from-[#E5B04C] to-[#A44E37] text-transparent bg-clip-text'
  },

  fabric: {
    name: 'Fabric',
    style: 'bg-gradient-to-b from-[#DBD0B4] to-[#38342A] text-transparent bg-clip-text'
  },

  quilt: {
    name: 'Quilt',
    style:
      'bg-gradient-to-b from-[#8B5CF6] via-[#EC4899] to-[#38BDF8] text-transparent bg-clip-text'
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
      />
      <Tab
        className={loaders['forge'].style}
        key="forge"
        title={<div className={loaders['forge'].style}>{loaders['forge'].name}</div>}
      />
      <Tab
        className={loaders['neoforge'].style}
        key="neoforge"
        title={<div className={loaders['neoforge'].style}>{loaders['neoforge'].name}</div>}
      />
      <Tab
        className={loaders['fabric'].style}
        key="fabric"
        title={<div className={loaders['fabric'].style}>{loaders['fabric'].name}</div>}
      />
      <Tab
        className={loaders['quilt'].style}
        key="quilt"
        title={<div className={loaders['quilt'].style}>{loaders['quilt'].name}</div>}
      />
    </Tabs>
  )
}
