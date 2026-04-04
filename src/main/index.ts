import { app, shell, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { autoUpdater } from 'electron-updater'

const isDev = process.env.NODE_ENV !== 'production'
const isMac = process.platform === 'darwin'

let mainWindow: BrowserWindow | null = null
let selectionKind: 'room' | 'hallway' | 'placement' | null = null

function send(action: string) {
  mainWindow?.webContents.send('menu:action', action)
}

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    // Mac: app name menu
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),

    {
      label: 'File',
      submenu: [
        { label: 'New Map',    accelerator: 'CmdOrCtrl+N',       click: () => send('file:new') },
        { label: 'Open...',    accelerator: 'CmdOrCtrl+O',       click: () => send('file:open') },
        { type: 'separator' },
        { label: 'Save',       accelerator: 'CmdOrCtrl+S',       click: () => send('file:save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('file:saveAs') },
        { type: 'separator' },
        { label: 'Export PDF', accelerator: 'CmdOrCtrl+E',       click: () => send('file:exportPdf') },
        // Quit lives in the app menu on Mac
        ...(!isMac ? [
          { type: 'separator' as const },
          { role: 'quit' as const }
        ] : [])
      ]
    },

    {
      label: 'Edit',
      submenu: [
        { label: 'Undo',  accelerator: 'CmdOrCtrl+Z',       click: () => send('edit:undo') },
        { label: 'Redo',  accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('edit:redo') },
        { type: 'separator' as const },
        { label: 'Cut',   accelerator: 'CmdOrCtrl+X', enabled: selectionKind === 'room' || selectionKind === 'placement', click: () => send('edit:cut') },
        { label: 'Copy',  accelerator: 'CmdOrCtrl+C', enabled: selectionKind === 'room' || selectionKind === 'placement', click: () => send('edit:copy') },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V',       click: () => send('edit:paste') },
      ]
    },

    {
      label: 'View',
      submenu: [
        { label: 'Top-Down',      click: () => send('view:topdown') },
        { label: 'Isometric',     click: () => send('view:isometric') },
        { label: 'FPS Walkthrough', click: () => send('view:fps') },
        ...(isDev ? [
          { type: 'separator' as const },
          { role: 'toggleDevTools' as const }
        ] : [])
      ]
    },

    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    },

    {
      label: 'Help',
      submenu: [
        { label: 'About Grid Crawler', click: () => send('app:about') }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Ask the renderer whether it's safe to close (dirty-check).
  // The renderer either calls app:confirmClose to proceed or does nothing to cancel.
  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow!.webContents.send('menu:action', 'app:beforeClose')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function sendUpdaterStatus(status: object) {
  mainWindow?.webContents.send('updater:status', status)
}

autoUpdater.on('checking-for-update',  () => sendUpdaterStatus({ state: 'checking' }))
autoUpdater.on('update-available',     (info) => sendUpdaterStatus({ state: 'available', version: info.version }))
autoUpdater.on('update-not-available', () => sendUpdaterStatus({ state: 'up-to-date' }))
autoUpdater.on('error',                (err) => sendUpdaterStatus({ state: 'error', message: err.message }))

ipcMain.on('updater:check', () => {
  if (isDev) {
    sendUpdaterStatus({ state: 'error', message: 'Updates are disabled in development mode.' })
    return
  }
  autoUpdater.checkForUpdates().catch((err) =>
    sendUpdaterStatus({ state: 'error', message: err.message })
  )
})

app.whenReady().then(() => {
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

// IPC: Set window title
ipcMain.on('window:setTitle', (_event, title: string) => {
  mainWindow?.setTitle(title)
})

// IPC: Selection kind changed — rebuild menu to update copy/cut enabled state
ipcMain.on('menu:selectionKind', (_event, kind: typeof selectionKind) => {
  selectionKind = kind
  buildMenu()
})

// IPC: Renderer confirmed it's safe to close
ipcMain.on('app:confirmClose', () => {
  mainWindow?.destroy()
})


// IPC: Open .crwl file
ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Grid Crawler Map', extensions: ['crwl'] }],
    properties: ['openFile']
  })
  if (result.canceled) return null
  const filePath = result.filePaths[0]
  const data = readFileSync(filePath)
  return { filePath, data: data.buffer }
})

// IPC: Save file dialog (returns chosen path)
ipcMain.handle('dialog:saveFile', async (_event, defaultName: string) => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'Grid Crawler Map', extensions: ['crwl'] }]
  })
  if (result.canceled) return null
  return result.filePath
})

// IPC: Write bytes to a path
ipcMain.handle('fs:writeFile', async (_event, filePath: string, data: ArrayBuffer) => {
  writeFileSync(filePath, Buffer.from(data))
  return true
})

// ── App catalog ───────────────────────────────────────────────────────────────

/**
 * Resolves the resources/catalog directory.
 * In development:  <repo>/resources/catalog
 * In production:   <app>/resources/catalog  (copied by electron-builder)
 */
function getCatalogDir(): string {
  if (isDev) {
    return join(app.getAppPath(), 'resources', 'catalog')
  }
  return join(process.resourcesPath, 'catalog')
}

/**
 * Loads tokens.json and props.json from the catalog directory, reads each
 * referenced SVG into its visual.iconContent field, and returns the merged
 * array. Missing files are skipped with a console warning.
 */
ipcMain.handle('catalog:loadApp', async () => {
  const catalogDir = getCatalogDir()

  function loadJson(filename: string): unknown[] {
    const p = join(catalogDir, filename)
    if (!existsSync(p)) { console.warn(`[catalog] missing ${p}`); return [] }
    try { return JSON.parse(readFileSync(p, 'utf8')) }
    catch (e) { console.warn(`[catalog] failed to parse ${filename}:`, e); return [] }
  }

  const tokens = loadJson('tokens.json') as Array<Record<string, unknown>>
  const props  = loadJson('props.json')  as Array<Record<string, unknown>>

  // Inline SVG content for token definitions
  for (const def of tokens) {
    try {
      const visual = def.visual as Record<string, unknown>
      if (typeof visual?.icon === 'string') {
        const svgPath = join(catalogDir, visual.icon as string)
        if (existsSync(svgPath)) {
          visual.iconContent = readFileSync(svgPath, 'utf8')
        } else {
          console.warn(`[catalog] missing SVG: ${svgPath}`)
          visual.iconContent = ''
        }
      }
    } catch (e) {
      console.warn('[catalog] error reading SVG for', def.id, e)
    }
  }

  // For props, resolve the texture path to an absolute file:// URL
  for (const def of props) {
    try {
      const visual = def.visual as Record<string, unknown>
      if (typeof visual?.texture === 'string') {
        const texPath = join(catalogDir, visual.texture as string)
        visual.textureUrl = existsSync(texPath)
          ? `file://${texPath.replace(/\\/g, '/')}`
          : ''
      }
    } catch (e) {
      console.warn('[catalog] error resolving texture for', def.id, e)
    }
  }

  return [...tokens, ...props]
})
