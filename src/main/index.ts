import { app, shell, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { autoUpdater } from 'electron-updater'

const isDev = process.env.NODE_ENV !== 'production'
const isMac = process.platform === 'darwin'

let mainWindow: BrowserWindow | null = null

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
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
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

app.whenReady().then(() => {
  buildMenu()
  createWindow()

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify()
  }

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

// IPC: Open .map file
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'Grid Crawler Map', extensions: ['map'] }],
    properties: ['openFile']
  })
  if (result.canceled) return null
  const filePath = result.filePaths[0]
  const data = readFileSync(filePath)
  return { filePath, data: data.buffer }
})

// IPC: Save file dialog (returns chosen path)
ipcMain.handle('dialog:saveFile', async (_event, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Grid Crawler Map', extensions: ['map'] }]
  })
  if (result.canceled) return null
  return result.filePath
})

// IPC: Write bytes to a path
ipcMain.handle('fs:writeFile', async (_event, filePath: string, data: ArrayBuffer) => {
  writeFileSync(filePath, Buffer.from(data))
  return true
})
