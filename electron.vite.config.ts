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
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index:            resolve('src/preload/index.ts'),
          'object-editor':  resolve('src/preload/object-editor.ts'),
          'texture-editor': resolve('src/preload/texture-editor.ts')
        }
      }
    }
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
    plugins: [react(), svgr()],
    build: {
      rollupOptions: {
        input: {
          main:          resolve('src/renderer/index.html'),
          objectEditor:  resolve('src/renderer/object-editor.html'),
          textureEditor: resolve('src/renderer/texture-editor.html')
        }
      }
    }
  }
})
