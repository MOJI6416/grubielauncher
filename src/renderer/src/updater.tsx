import './assets/main.css'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'

import { HeroUIProvider, Image, Progress, Spinner } from '@heroui/react'
import './i18n'
import { useTranslation } from 'react-i18next'
import { languages } from './components/Settings'
import icon from './assets/icon.png'
import { TSettings } from '@/types/Settings'

const api = window.api
const fs = api.fs
const ipcRenderer = window.electron.ipcRenderer
const path = api.path
const getPath = api.getPath

const App = () => {
  const [state, setState] = useState<'checking' | 'downloading'>('checking')
  const [progress, setProgress] = useState(0)

  const { t, i18n } = useTranslation()

  useEffect(() => {
    async function getLocale() {
      const systemLocate: string = await window.electron.ipcRenderer.invoke('getLocale')
      const l = languages.find((l) => systemLocate.includes(l.code))

      let data: Partial<TSettings> = {}

      try {
        const appData = await getPath('appData')
        if (!appData) return

        const launcherPath = path.join(appData, '.grubielauncher')
        const settingsConfPath = path.join(launcherPath, 'settings.json')

        await fs.access(settingsConfPath)
        data = await fs.readJSON(settingsConfPath, 'utf-8')
      } catch {}

      i18n.changeLanguage(data?.lang || l?.code || i18n.language)
    }

    getLocale()
  }, [])

  useEffect(() => {
    ipcRenderer.on('download-progress', (_, p) => {
      setProgress(p.percent.toFixed(1))
      setState('downloading')
    })
  }, [])

  return (
    <div className="h-screen text-center items-center flex flex-col justify-center space-y-8 p-4">
      <div className="flex flex-col space-y-1.5 items-center">
        <Image width={64} height={64} src={icon} draggable={false} />
        <p>Grubie Launcher</p>
      </div>
      {state == 'checking' && <Spinner size="sm" label={t('updater.checking')} />}
      {state == 'downloading' && (
        <Progress size="sm" maxValue={100} value={progress} label={t('updater.downloading')} />
      )}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HeroUIProvider>
      <App />
    </HeroUIProvider>
  </React.StrictMode>
)
