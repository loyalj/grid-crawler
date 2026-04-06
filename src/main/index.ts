import { app, shell, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { autoUpdater } from 'electron-updater'

const isDev = process.env.NODE_ENV !== 'production'
const isMac = process.platform === 'darwin'

let mainWindow:       BrowserWindow | null = null
let objectEditorWin:  BrowserWindow | null = null
let textureEditorWin: BrowserWindow | null = null
let selectionKind: 'room' | 'hallway' | 'placement' | null = null
let currentViewMode    = 'layout'
let currentGridVisible = true

/** Latest project-tier texture state pushed from the renderer */
let currentProjectTextures: {
  textures:   Array<Record<string, unknown>>
  open:       boolean
} = { textures: [], open: false }

/** Latest project-tier catalog state pushed from the renderer */
let currentProjectCatalog: {
  objects:               Array<Record<string, unknown>>
  tokenCategories:       string[]
  propCategories:        string[]
  open:                  boolean
} = { objects: [], tokenCategories: [], propCategories: [], open: false }

type SimpleBinding = { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean }
type KeyBindingsMap = Record<string, SimpleBinding[]>
let currentKeyBindings: KeyBindingsMap = {}

function toAccelerator(b: SimpleBinding): string {
  const parts: string[] = []
  if (b.ctrl)  parts.push('CmdOrCtrl')
  if (b.alt)   parts.push('Alt')
  if (b.shift) parts.push('Shift')
  const key = b.key.length === 1 ? b.key.toUpperCase() : b.key
  parts.push(key)
  return parts.join('+')
}

function accel(action: string): string | undefined {
  const bindings = currentKeyBindings[action]
  if (!bindings || bindings.length === 0) return undefined
  return toAccelerator(bindings[0])
}

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
        { label: 'Undo',  accelerator: accel('undo') ?? 'CmdOrCtrl+Z',       click: () => send('edit:undo') },
        { label: 'Redo',  accelerator: accel('redo') ?? 'CmdOrCtrl+Shift+Z', click: () => send('edit:redo') },
        { type: 'separator' as const },
        { label: 'Cut',   accelerator: 'CmdOrCtrl+X', enabled: selectionKind === 'room' || selectionKind === 'placement', click: () => send('edit:cut') },
        { label: 'Copy',  accelerator: 'CmdOrCtrl+C', enabled: selectionKind === 'room' || selectionKind === 'placement', click: () => send('edit:copy') },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V',       click: () => send('edit:paste') },
      ]
    },

    {
      label: 'World',
      submenu: [
        { label: 'Objects...',        click: () => openObjectEditor()  },
        { label: 'Textures...',       click: () => openTextureEditor() },
        { type: 'separator' },
        { label: 'Generate Level...', click: () => send('world:generateLevel') }
      ]
    },

    {
      label: 'View',
      submenu: [
        { label: '2D Layout',       type: 'radio' as const, checked: currentViewMode === 'layout',    accelerator: accel('viewLayout'),    click: () => send('view:layout') },
        { label: '2D Textured',     type: 'radio' as const, checked: currentViewMode === 'textured',  accelerator: accel('viewTextured'),  click: () => send('view:textured') },
        { label: 'Isometric',       type: 'radio' as const, checked: currentViewMode === 'isometric', accelerator: accel('viewIsometric'), click: () => send('view:isometric') },
        { label: 'FPS Walkthrough', type: 'radio' as const, checked: currentViewMode === 'fps',       accelerator: accel('viewFps'),       click: () => send('view:fps') },
        { type: 'separator' as const },
        { label: 'Show Grid', type: 'checkbox' as const, checked: currentGridVisible, accelerator: accel('toggleGrid'), click: () => send('view:toggleGrid') },
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

// ── Object editor window ───────────────────────────────────────────────────────

function openObjectEditor(): void {
  if (objectEditorWin && !objectEditorWin.isDestroyed()) {
    objectEditorWin.focus()
    return
  }

  objectEditorWin = new BrowserWindow({
    width:     1100,
    height:    700,
    minWidth:  800,
    minHeight: 500,
    title:     'Object Catalog',
    show:      false,
    webPreferences: {
      preload:  join(__dirname, '../preload/object-editor.js'),
      sandbox:  false
    }
  })

  objectEditorWin.setMenu(null)
  objectEditorWin.on('ready-to-show', () => objectEditorWin!.show())
  objectEditorWin.on('closed', () => { objectEditorWin = null })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    objectEditorWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/object-editor.html`)
  } else {
    objectEditorWin.loadFile(join(__dirname, '../renderer/object-editor.html'))
  }
}

// ── Texture editor window ──────────────────────────────────────────────────────

function openTextureEditor(): void {
  if (textureEditorWin && !textureEditorWin.isDestroyed()) {
    textureEditorWin.focus()
    return
  }

  textureEditorWin = new BrowserWindow({
    width:     1000,
    height:    650,
    minWidth:  700,
    minHeight: 450,
    title:     'Texture Catalog',
    show:      false,
    webPreferences: {
      preload:  join(__dirname, '../preload/texture-editor.js'),
      sandbox:  false
    }
  })

  textureEditorWin.setMenu(null)
  textureEditorWin.on('ready-to-show', () => textureEditorWin!.show())
  textureEditorWin.on('closed', () => { textureEditorWin = null })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    textureEditorWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/texture-editor.html`)
  } else {
    textureEditorWin.loadFile(join(__dirname, '../renderer/texture-editor.html'))
  }
}

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

// IPC: View mode changed — rebuild menu to update checked state
ipcMain.on('menu:viewMode', (_event, mode: string) => {
  currentViewMode = mode
  buildMenu()
})

// IPC: Grid visibility changed — rebuild menu to sync checkbox
ipcMain.on('menu:gridVisible', (_event, visible: boolean) => {
  currentGridVisible = visible
  buildMenu()
})

// IPC: Keybindings changed — rebuild menu to update accelerators
ipcMain.on('menu:keyBindings', (_event, bindings: KeyBindingsMap) => {
  currentKeyBindings = bindings
  buildMenu()
})

// IPC: Renderer confirmed it's safe to close
ipcMain.on('app:confirmClose', () => {
  mainWindow?.destroy()
})

// ── Object editor IPC ─────────────────────────────────────────────────────────

// Main window pushes its current project catalog state whenever it changes
ipcMain.on('objectEditor:setProjectState', (_event, state: typeof currentProjectCatalog) => {
  currentProjectCatalog = state
  // Forward to editor window if open
  if (objectEditorWin && !objectEditorWin.isDestroyed()) {
    objectEditorWin.webContents.send('objectEditor:snapshot', buildSnapshot())
  }
})

// Main window opens the editor via menu IPC
ipcMain.on('objectEditor:open', () => openObjectEditor())

// Editor window requests a fresh snapshot on load
ipcMain.handle('objectEditor:getSnapshot', async () => buildSnapshot())

/** Build the full catalog snapshot to send to the editor window */
async function buildSnapshot(): Promise<Record<string, unknown>> {
  const appData = await loadCatalogFromDisk()
  return {
    appTokenCategories: appData.tokenCategories,
    appPropCategories:  appData.propCategories,
    appObjects:         appData.objects,
    projectTokenCategories: currentProjectCatalog.tokenCategories,
    projectPropCategories:  currentProjectCatalog.propCategories,
    projectObjects:         currentProjectCatalog.objects,
    projectOpen:            currentProjectCatalog.open
  }
}

/** Read the catalog from disk (used for app-tier operations and snapshots) */
async function loadCatalogFromDisk(): Promise<{
  tokenCategories: string[]
  propCategories:  string[]
  objects:         Array<Record<string, unknown>>
}> {
  const catalogDir = getCatalogDir()
  function loadJson(filename: string): Record<string, unknown> {
    const p = join(catalogDir, filename)
    if (!existsSync(p)) return { categories: [], objects: [] }
    try { return JSON.parse(readFileSync(p, 'utf8')) }
    catch { return { categories: [], objects: [] } }
  }
  const tokensFile = loadJson('tokens.json')
  const propsFile  = loadJson('props.json')
  const tokenObjs  = (tokensFile.objects as Array<Record<string, unknown>>) ?? []
  const propObjs   = (propsFile.objects  as Array<Record<string, unknown>>) ?? []

  // Inline SVGs for tokens
  for (const def of tokenObjs) {
    const visual = def.visual as Record<string, unknown>
    if (typeof visual?.icon === 'string') {
      const svgPath = join(catalogDir, visual.icon as string)
      visual.iconContent = existsSync(svgPath) ? readFileSync(svgPath, 'utf8') : ''
    }
  }
  // Resolve texture URLs for props (inline as base64 data URLs, same as floor textures)
  for (const def of propObjs) {
    const visual = def.visual as Record<string, unknown>
    if (typeof visual?.texture === 'string') {
      const texPath = join(catalogDir, visual.texture as string)
      if (existsSync(texPath)) {
        try {
          const buf  = readFileSync(texPath)
          const ext  = (visual.texture as string).split('.').pop()?.toLowerCase() ?? 'png'
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
          visual.textureUrl = `data:${mime};base64,${buf.toString('base64')}`
        } catch {
          visual.textureUrl = ''
        }
      } else {
        visual.textureUrl = ''
      }
    }
  }

  return {
    tokenCategories: (tokensFile.categories as string[]) ?? [],
    propCategories:  (propsFile.categories  as string[]) ?? [],
    objects:         [...tokenObjs, ...propObjs]
  }
}

/** Broadcast updated snapshot to all windows */
async function broadcastCatalogUpdate(): Promise<void> {
  const snapshot = await buildSnapshot()
  mainWindow?.webContents.send('objectEditor:catalogUpdated', snapshot)
  if (objectEditorWin && !objectEditorWin.isDestroyed()) {
    objectEditorWin.webContents.send('objectEditor:snapshot', snapshot)
  }
}

// Editor: create or update an object
ipcMain.handle('objectEditor:saveObject', async (_event, obj: Record<string, unknown>) => {
  if (obj.tier === 'app') {
    await saveAppObject(obj)
    await broadcastCatalogUpdate()
  } else {
    // Project-tier: forward to main window
    mainWindow?.webContents.send('objectEditor:saveProjectObject', obj)
  }
})

// Editor: delete an object
ipcMain.handle('objectEditor:deleteObject', async (_event, id: string, tier: string) => {
  if (tier === 'app') {
    await deleteAppObject(id)
    await broadcastCatalogUpdate()
  } else {
    mainWindow?.webContents.send('objectEditor:deleteProjectObject', id)
  }
})

// Editor: update categories
ipcMain.handle('objectEditor:saveCategories',
  async (_event, kind: 'token' | 'prop', tier: 'app' | 'project', categories: string[]) => {
    if (tier === 'app') {
      await saveAppCategories(kind, categories)
      await broadcastCatalogUpdate()
    } else {
      mainWindow?.webContents.send('objectEditor:saveProjectCategories', { kind, categories })
    }
  }
)

// ── App-tier catalog write helpers ────────────────────────────────────────────

async function saveAppObject(obj: Record<string, unknown>): Promise<void> {
  const catalogDir = getCatalogDir()
  const filename   = obj.kind === 'token' ? 'tokens.json' : 'props.json'
  const filePath   = join(catalogDir, filename)

  let data: { categories: string[]; objects: Array<Record<string, unknown>> } =
    { categories: [], objects: [] }
  if (existsSync(filePath)) {
    try { data = JSON.parse(readFileSync(filePath, 'utf8')) } catch { /* keep default */ }
  }

  // Embed SVG file for tokens if iconDataUrl provided
  if (obj.kind === 'token') {
    const visual = obj.visual as Record<string, unknown>
    if (typeof visual?.iconDataUrl === 'string' && typeof visual?.icon === 'string') {
      const svgPath = join(catalogDir, visual.icon as string)
      const { mkdirSync } = await import('fs')
      mkdirSync(join(svgPath, '..'), { recursive: true })
      const base64 = (visual.iconDataUrl as string).replace(/^data:[^;]+;base64,/, '')
      writeFileSync(svgPath, Buffer.from(base64, 'base64').toString('utf8'))
      delete visual.iconDataUrl
      delete visual.iconContent
    }
  }

  // Embed prop texture if textureDataUrl provided
  if (obj.kind === 'prop') {
    const visual = obj.visual as Record<string, unknown>
    if (typeof visual?.textureDataUrl === 'string' && typeof visual?.texture === 'string') {
      const texPath = join(catalogDir, visual.texture as string)
      const { mkdirSync } = await import('fs')
      mkdirSync(join(texPath, '..'), { recursive: true })
      const base64 = (visual.textureDataUrl as string).replace(/^data:[^;]+;base64,/, '')
      writeFileSync(texPath, Buffer.from(base64, 'base64'))
      delete visual.textureDataUrl
      delete visual.textureUrl
    }
  }

  const idx = data.objects.findIndex((o) => o.id === obj.id)
  if (idx >= 0) data.objects[idx] = obj
  else          data.objects.push(obj)

  writeFileSync(filePath, JSON.stringify(data, null, 2))
}

async function deleteAppObject(id: string): Promise<void> {
  const catalogDir = getCatalogDir()
  for (const filename of ['tokens.json', 'props.json']) {
    const filePath = join(catalogDir, filename)
    if (!existsSync(filePath)) continue
    try {
      const data: { categories: string[]; objects: Array<Record<string, unknown>> } =
        JSON.parse(readFileSync(filePath, 'utf8'))
      const before = data.objects.length
      data.objects = data.objects.filter((o) => o.id !== id)
      if (data.objects.length !== before) {
        writeFileSync(filePath, JSON.stringify(data, null, 2))
        break
      }
    } catch { /* skip */ }
  }
}

async function saveAppCategories(kind: 'token' | 'prop', categories: string[]): Promise<void> {
  const catalogDir = getCatalogDir()
  const filename   = kind === 'token' ? 'tokens.json' : 'props.json'
  const filePath   = join(catalogDir, filename)
  let data: { categories: string[]; objects: Array<Record<string, unknown>> } =
    { categories: [], objects: [] }
  if (existsSync(filePath)) {
    try { data = JSON.parse(readFileSync(filePath, 'utf8')) } catch { /* keep default */ }
  }
  data.categories = categories
  writeFileSync(filePath, JSON.stringify(data, null, 2))
}

// Editor: export catalog zip
ipcMain.handle('objectEditor:exportZip', async (_event, filter: 'all' | 'app' | 'project') => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'object-catalog.zip',
    filters: [{ name: 'Catalog ZIP', extensions: ['zip'] }]
  })
  if (result.canceled || !result.filePath) return null

  const JSZip = (await import('jszip')).default
  const zip   = new JSZip()
  const snap  = await buildSnapshot()

  const includeApp     = filter === 'all' || filter === 'app'
  const includeProject = filter === 'all' || filter === 'project'

  const allObjects: Array<Record<string, unknown>> = [
    ...(includeApp     ? (snap.appObjects     as Array<Record<string, unknown>>) : []),
    ...(includeProject ? (snap.projectObjects  as Array<Record<string, unknown>>) : [])
  ]
  const tokenCats = [
    ...(includeApp     ? (snap.appTokenCategories    as string[]) : []),
    ...(includeProject ? (snap.projectTokenCategories as string[]) : [])
  ]
  const propCats = [
    ...(includeApp     ? (snap.appPropCategories    as string[]) : []),
    ...(includeProject ? (snap.projectPropCategories as string[]) : [])
  ]

  zip.file('catalog.json', JSON.stringify({
    tokenCategories: [...new Set(tokenCats)],
    propCategories:  [...new Set(propCats)],
    objects: allObjects.map((o) => {
      // Strip runtime-only fields
      if (o.kind === 'token') {
        const v = { ...(o.visual as Record<string, unknown>) }; delete v.iconContent
        return { ...o, visual: v }
      } else {
        const v = { ...(o.visual as Record<string, unknown>) }; delete v.textureUrl
        return { ...o, visual: v }
      }
    })
  }, null, 2))

  // Embed referenced image files
  const catalogDir = getCatalogDir()
  for (const obj of allObjects) {
    if (obj.kind === 'token' && obj.tier === 'app') {
      const icon = (obj.visual as Record<string, unknown>).icon as string
      if (icon) {
        const p = join(catalogDir, icon)
        if (existsSync(p)) zip.file(icon, readFileSync(p))
      }
    }
    if (obj.kind === 'prop' && obj.tier === 'app') {
      const tex = (obj.visual as Record<string, unknown>).texture as string
      if (tex) {
        const p = join(catalogDir, tex)
        if (existsSync(p)) zip.file(tex, readFileSync(p))
      }
    }
  }

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  writeFileSync(result.filePath, buf)
  return true
})

// Editor: import catalog zip
ipcMain.handle('objectEditor:importZip', async (_event, mode: 'merge' | 'replace', tier: 'app' | 'project') => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Catalog ZIP', extensions: ['zip'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const JSZip   = (await import('jszip')).default
  const buf     = readFileSync(result.filePaths[0])
  const zip     = await JSZip.loadAsync(buf)
  const jsonStr = await zip.file('catalog.json')?.async('string')
  if (!jsonStr) return null

  const imported: {
    tokenCategories: string[]
    propCategories:  string[]
    objects: Array<Record<string, unknown>>
  } = JSON.parse(jsonStr)

  if (tier === 'app') {
    const catalogDir = getCatalogDir()

    // Extract embedded image files
    for (const [path, file] of Object.entries(zip.files)) {
      if (path === 'catalog.json' || file.dir) continue
      const { mkdirSync } = await import('fs')
      const dest = join(catalogDir, path)
      mkdirSync(join(dest, '..'), { recursive: true })
      writeFileSync(dest, Buffer.from(await file.async('arraybuffer')))
    }

    const tokenObjs = imported.objects.filter((o) => o.kind === 'token')
    const propObjs  = imported.objects.filter((o) => o.kind === 'prop')

    await applyImport('tokens.json', tokenObjs, imported.tokenCategories, mode)
    await applyImport('props.json',  propObjs,  imported.propCategories,  mode)
    await broadcastCatalogUpdate()
  } else {
    // Project-tier import: forward imported data to main window
    mainWindow?.webContents.send('objectEditor:importProjectObjects', { imported, mode })
  }

  return true
})

async function applyImport(
  filename: string,
  incomingObjs: Array<Record<string, unknown>>,
  incomingCats: string[],
  mode: 'merge' | 'replace'
): Promise<void> {
  const catalogDir = getCatalogDir()
  const filePath   = join(catalogDir, filename)
  let existing: { categories: string[]; objects: Array<Record<string, unknown>> } =
    { categories: [], objects: [] }
  if (existsSync(filePath)) {
    try { existing = JSON.parse(readFileSync(filePath, 'utf8')) } catch { /* keep default */ }
  }

  if (mode === 'replace') {
    existing.categories = incomingCats
    existing.objects    = incomingObjs
  } else {
    // Merge: update existing by id, append new
    const byId = new Map(existing.objects.map((o) => [o.id, o]))
    for (const obj of incomingObjs) byId.set(obj.id as string, obj)
    existing.objects = [...byId.values()]
    // Union categories preserving order
    const catSet = new Set([...existing.categories, ...incomingCats])
    existing.categories = [...catSet]
  }

  writeFileSync(filePath, JSON.stringify(existing, null, 2))
}

// Editor: open file pickers
ipcMain.handle('objectEditor:pickSvgFile', async () => {
  if (!objectEditorWin) return null
  const result = await dialog.showOpenDialog(objectEditorWin, {
    filters: [{ name: 'SVG Image', extensions: ['svg'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const content = readFileSync(result.filePaths[0], 'utf8')
  const name    = result.filePaths[0].split(/[\\/]/).pop()!
  return { name, content }
})

ipcMain.handle('objectEditor:pickImageFile', async () => {
  if (!objectEditorWin) return null
  const result = await dialog.showOpenDialog(objectEditorWin, {
    filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const buf  = readFileSync(result.filePaths[0])
  const ext  = result.filePaths[0].split('.').pop()?.toLowerCase() ?? 'png'
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
  return {
    name:    result.filePaths[0].split(/[\\/]/).pop()!,
    dataUrl: `data:${mime};base64,${buf.toString('base64')}`
  }
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

/** Loads the app catalog from disk and returns the full payload. */
ipcMain.handle('catalog:loadApp', async () => loadCatalogFromDisk())

// ── Unified texture catalog ───────────────────────────────────────────────────

function getTextureDir(): string {
  if (isDev) return join(app.getAppPath(), 'resources', 'textures')
  return join(process.resourcesPath, 'textures')
}

function getTextureImageDir(): string {
  return join(getTextureDir(), 'images')
}

async function loadTextureCatalogFromDisk(): Promise<Array<Record<string, unknown>>> {
  const dir         = getTextureDir()
  const imageDir    = getTextureImageDir()
  const catalogPath = join(dir, 'catalog.json')

  if (!existsSync(catalogPath)) {
    console.warn('[textureCatalog] missing catalog.json at', catalogPath)
    return []
  }
  let defs: Array<Record<string, unknown>>
  try {
    defs = JSON.parse(readFileSync(catalogPath, 'utf8'))
  } catch (e) {
    console.warn('[textureCatalog] failed to parse catalog.json:', e)
    return []
  }
  for (const def of defs) {
    def.tier      = 'app'
    def.textureUrl = ''
    def.rotation  = def.rotation  ?? 0
    def.offsetX   = def.offsetX   ?? 0
    def.offsetY   = def.offsetY   ?? 0
    def.category  = def.category  ?? ''
    def.surface   = def.surface   ?? 'both'
    if (typeof def.texture === 'string') {
      const texPath = join(imageDir, def.texture as string)
      if (existsSync(texPath)) {
        try {
          const buf  = readFileSync(texPath)
          const ext  = (def.texture as string).split('.').pop()?.toLowerCase() ?? 'jpg'
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
          def.textureUrl = `data:${mime};base64,${buf.toString('base64')}`
        } catch (e) {
          console.warn('[textureCatalog] failed to read texture file:', texPath, e)
        }
      } else {
        console.warn('[textureCatalog] missing texture file:', texPath)
      }
    }
  }
  return defs
}

ipcMain.handle('textureCatalog:loadApp', () => loadTextureCatalogFromDisk())

// ── Texture editor IPC ────────────────────────────────────────────────────────

// Main window pushes current project texture state whenever it changes
ipcMain.on('textureEditor:setProjectState', (_event, state: typeof currentProjectTextures) => {
  currentProjectTextures = state
  if (textureEditorWin && !textureEditorWin.isDestroyed()) {
    buildTextureSnapshot().then((snap) => {
      textureEditorWin?.webContents.send('textureEditor:snapshot', snap)
    })
  }
})

// Editor requests fresh snapshot on load
ipcMain.handle('textureEditor:getSnapshot', async () => buildTextureSnapshot())

/** Build full snapshot: app textures from disk + project textures from renderer */
async function buildTextureSnapshot(): Promise<Record<string, unknown>> {
  const appTextures = await loadTextureCatalogFromDisk()
  return {
    appTextures:     appTextures,
    projectTextures: currentProjectTextures.textures,
    projectOpen:     currentProjectTextures.open
  }
}

/** Broadcast updated snapshot to main window and texture editor */
async function broadcastTextureUpdate(): Promise<void> {
  const snapshot = await buildTextureSnapshot()
  mainWindow?.webContents.send('textureEditor:catalogUpdated', snapshot)
  if (textureEditorWin && !textureEditorWin.isDestroyed()) {
    textureEditorWin.webContents.send('textureEditor:snapshot', snapshot)
  }
}

// Editor: save a texture (app-tier → disk; project-tier → forward to main window)
ipcMain.handle('textureEditor:saveTexture', async (_event, tex: Record<string, unknown>) => {
  if (tex.tier === 'app') {
    await saveAppTexture(tex)
    await broadcastTextureUpdate()
  } else {
    mainWindow?.webContents.send('textureEditor:saveProjectTexture', tex)
  }
})

// Editor: delete a texture
ipcMain.handle('textureEditor:deleteTexture', async (_event, id: string, tier: string) => {
  if (tier === 'app') {
    await deleteAppTexture(id)
    await broadcastTextureUpdate()
  } else {
    mainWindow?.webContents.send('textureEditor:deleteProjectTexture', id)
  }
})

// Editor: image file picker
ipcMain.handle('textureEditor:pickImageFile', async () => {
  if (!textureEditorWin) return null
  const result = await dialog.showOpenDialog(textureEditorWin, {
    filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const buf  = readFileSync(result.filePaths[0])
  const ext  = result.filePaths[0].split('.').pop()?.toLowerCase() ?? 'png'
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
  return {
    name:    result.filePaths[0].split(/[\\/]/).pop()!,
    dataUrl: `data:${mime};base64,${buf.toString('base64')}`
  }
})

// ── App-tier texture write helpers ────────────────────────────────────────────

async function saveAppTexture(tex: Record<string, unknown>): Promise<void> {
  const dir         = getTextureDir()
  const imageDir    = getTextureImageDir()
  const catalogPath = join(dir, 'catalog.json')

  let defs: Array<Record<string, unknown>> = []
  if (existsSync(catalogPath)) {
    try { defs = JSON.parse(readFileSync(catalogPath, 'utf8')) } catch { /* keep empty */ }
  }

  // Write image file if a new one was picked
  if (typeof tex.textureDataUrl === 'string' && typeof tex.texture === 'string') {
    const { mkdirSync } = await import('fs')
    mkdirSync(imageDir, { recursive: true })
    const base64 = (tex.textureDataUrl as string).replace(/^data:[^;]+;base64,/, '')
    writeFileSync(join(imageDir, tex.texture as string), Buffer.from(base64, 'base64'))
  }

  // Strip runtime-only fields before persisting
  const persisted = { ...tex }
  delete persisted.textureDataUrl
  delete persisted.textureUrl
  delete persisted.tier

  const idx = defs.findIndex((d) => d.id === tex.id)
  if (idx >= 0) defs[idx] = persisted
  else          defs.push(persisted)

  writeFileSync(catalogPath, JSON.stringify(defs, null, 2))
}

async function deleteAppTexture(id: string): Promise<void> {
  const catalogPath = join(getTextureDir(), 'catalog.json')
  if (!existsSync(catalogPath)) return
  try {
    const defs: Array<Record<string, unknown>> = JSON.parse(readFileSync(catalogPath, 'utf8'))
    const filtered = defs.filter((d) => d.id !== id)
    if (filtered.length !== defs.length) {
      writeFileSync(catalogPath, JSON.stringify(filtered, null, 2))
    }
  } catch { /* ignore */ }
}
