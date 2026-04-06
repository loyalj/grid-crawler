import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { UpdaterStatus } from '../renderer/src/types/electron'

// WeakMap tracks the ipcRenderer wrapper created for each user callback so that
// removeListener receives the exact same function reference that was passed to on().
const menuWrappers = new WeakMap<
  (action: string) => void,
  (_event: IpcRendererEvent, action: string) => void
>()

const updaterWrappers = new WeakMap<
  (status: UpdaterStatus) => void,
  (_event: IpcRendererEvent, status: UpdaterStatus) => void
>()

contextBridge.exposeInMainWorld('electronAPI', {
  // File system
  openFile: (): Promise<{ filePath: string; data: ArrayBuffer } | null> =>
    ipcRenderer.invoke('dialog:openFile'),

  saveFile: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', defaultName),

  writeFile: (filePath: string, data: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke('fs:writeFile', filePath, data),

  // App catalog
  loadAppCatalog: (): Promise<unknown[]> =>
    ipcRenderer.invoke('catalog:loadApp'),

  // Unified texture catalog
  loadAppTextureCatalog: (): Promise<unknown[]> =>
    ipcRenderer.invoke('textureCatalog:loadApp'),

  // Menu actions sent from the main process
  onMenuAction: (callback: (action: string) => void) => {
    const wrapper = (_event: IpcRendererEvent, action: string) => callback(action)
    menuWrappers.set(callback, wrapper)
    ipcRenderer.on('menu:action', wrapper)
  },

  setTitle: (title: string) => ipcRenderer.send('window:setTitle', title),
  confirmClose: () => ipcRenderer.send('app:confirmClose'),
  setSelectionKind: (kind: 'room' | 'hallway' | 'placement' | null) =>
    ipcRenderer.send('menu:selectionKind', kind),
  setViewMode: (mode: string) =>
    ipcRenderer.send('menu:viewMode', mode),
  setGridVisible: (visible: boolean) =>
    ipcRenderer.send('menu:gridVisible', visible),

  // Object editor
  openObjectEditor: () =>
    ipcRenderer.send('objectEditor:open'),

  setObjectEditorProjectState: (state: unknown) =>
    ipcRenderer.send('objectEditor:setProjectState', state),

  onSaveProjectObject: (cb: (obj: unknown) => void) => {
    ipcRenderer.on('objectEditor:saveProjectObject', (_e, obj) => cb(obj))
  },
  onDeleteProjectObject: (cb: (id: string) => void) => {
    ipcRenderer.on('objectEditor:deleteProjectObject', (_e, id) => cb(id))
  },
  onSaveProjectCategories: (cb: (data: { kind: 'token' | 'prop'; categories: string[] }) => void) => {
    ipcRenderer.on('objectEditor:saveProjectCategories', (_e, data) => cb(data))
  },
  onImportProjectObjects: (cb: (data: unknown) => void) => {
    ipcRenderer.on('objectEditor:importProjectObjects', (_e, data) => cb(data))
  },
  onCatalogUpdated: (cb: (snapshot: unknown) => void) => {
    ipcRenderer.on('objectEditor:catalogUpdated', (_e, snap) => cb(snap))
  },
  setKeyBindings: (bindings: unknown) =>
    ipcRenderer.send('menu:keyBindings', bindings),

  // Texture editor project state sync
  setTextureEditorProjectState: (state: unknown) =>
    ipcRenderer.send('textureEditor:setProjectState', state),

  onSaveProjectTexture: (cb: (tex: unknown) => void) => {
    ipcRenderer.on('textureEditor:saveProjectTexture', (_e, tex) => cb(tex))
  },
  onDeleteProjectTexture: (cb: (id: string) => void) => {
    ipcRenderer.on('textureEditor:deleteProjectTexture', (_e, id) => cb(id))
  },
  onTextureCatalogUpdated: (cb: (snapshot: unknown) => void) => {
    ipcRenderer.on('textureEditor:catalogUpdated', (_e, snap) => cb(snap))
  },

  offMenuAction: (callback: (action: string) => void) => {
    const wrapper = menuWrappers.get(callback)
    if (wrapper) {
      ipcRenderer.removeListener('menu:action', wrapper)
      menuWrappers.delete(callback)
    }
  },

  checkForUpdates: () => ipcRenderer.send('updater:check'),

  onUpdaterStatus: (callback: (status: UpdaterStatus) => void) => {
    const wrapper = (_event: IpcRendererEvent, status: UpdaterStatus) => callback(status)
    updaterWrappers.set(callback, wrapper)
    ipcRenderer.on('updater:status', wrapper)
  },

  offUpdaterStatus: (callback: (status: UpdaterStatus) => void) => {
    const wrapper = updaterWrappers.get(callback)
    if (wrapper) {
      ipcRenderer.removeListener('updater:status', wrapper)
      updaterWrappers.delete(callback)
    }
  }
})
