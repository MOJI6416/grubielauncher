import './assets/main.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import { preloadAppLanguage } from './app/bootstrap/preloadLanguage'

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

void preloadAppLanguage().then(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
