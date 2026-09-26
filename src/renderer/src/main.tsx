import './assets/main.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import { preloadAppLanguage } from './app/bootstrap/preloadLanguage'
import { installUiErrorCapture, uiJournal } from './utilities/journal'

installUiErrorCapture()
uiJournal.info('app', 'main window script started')

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

void preloadAppLanguage().then(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
