import './assets/main.css'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'

import { HeroUIProvider, Image, Progress, Spinner } from '@heroui/react'
import './i18n'
import { useTranslation } from 'react-i18next'
import icon from './assets/icon.png'
import { LANGUAGES, TSettings } from '@/types/Settings'
import Background from './components/Background'
const api = window.api

const App = () => {
  const [state, setState] = useState<'checking' | 'downloading'>('checking')
  const [progress, setProgress] = useState(0)

  const { t, i18n } = useTranslation()

  useEffect(() => {
    async function getLocale() {
      const systemLocate: string = await api.other.getLocale()
      const l = LANGUAGES.find((l) => systemLocate.includes(l.code))

      let data: Partial<TSettings> = {}

      const appData = await api.other.getPath('appData')
      if (!appData) return

      const launcherPath = await api.path.join(appData, '.grubielauncher')
      const settingsConfPath = await api.path.join(launcherPath, 'settings.json')

      if (await api.fs.pathExists(settingsConfPath))
        data = await api.fs.readJSON(settingsConfPath, 'utf-8')

      i18n.changeLanguage(data?.lang || l?.code || i18n.language)
    }

    getLocale()
  }, [])

  useEffect(() => {
    api.events.updater.onDownloadProgress((p) => {
      setProgress(p)
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
      <Background>
        <App />
      </Background>
    </HeroUIProvider>
  </React.StrictMode>
)
