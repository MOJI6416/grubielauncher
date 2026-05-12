import './assets/main.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import Background from './components/Background'
import { Toaster } from '@/components/ui/sonner'

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
root.render(
  <React.StrictMode>
    <>
      <Background>
        <App />
      </Background>
      <Toaster position="bottom-right" />
    </>
  </React.StrictMode>
)
