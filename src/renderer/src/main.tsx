import './assets/main.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { HeroUIProvider, ToastProvider } from '@heroui/react'
import './i18n'
import Background from './components/Background'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HeroUIProvider>
      <ToastProvider />
      <Background>
        <App />
      </Background>
    </HeroUIProvider>
  </React.StrictMode>
)
