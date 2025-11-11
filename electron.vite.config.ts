import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@': resolve(__dirname, 'src'),
  '@renderer': resolve(__dirname, 'src/renderer/src')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias
      },
      define: {
        'process.env.DISCORD_CLIENT_ID': JSON.stringify(env.MAIN_VITE_DISCORD_CLIENT_ID),
        'process.env.DISCORD_CLIENT_PASSWORD': JSON.stringify(
          env.MAIN_VITE_DISCORD_CLIENT_PASSWORD
        ),
        'process.env.MICROSOFT_CLIENT_ID': JSON.stringify(env.MAIN_VITE_MICROSOFT_CLIENT_ID),
        'process.env.ELYBY_CLIENT_ID': JSON.stringify(env.MAIN_VITE_ELYBY_CLIENT_ID),
        'process.env.ELYBY_CLIENT_SECRET': JSON.stringify(env.MAIN_VITE_ELYBY_CLIENT_SECRET),
        'process.env.BACKEND_URL': JSON.stringify(env.MAIN_VITE_BACKEND_URL),
        'process.env.CURSEFORGE_API_KEY': JSON.stringify(env.MAIN_VITE_CURSEFORGE_API_KEY)
      }
    },
    renderer: {
      resolve: {
        alias
      },
      plugins: [react()],
      build: {
        rollupOptions: {
          input: {
            main: resolve(__dirname, 'src/renderer/index.html'),
            updater: resolve(__dirname, 'src/renderer/updater.html')
          }
        }
      }
    }
  }
})
