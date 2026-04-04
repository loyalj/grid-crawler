import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __APP_ARCH__:    JSON.stringify(process.arch)
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), svgr()]
  }
})
