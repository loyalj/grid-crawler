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

  // Floor texture catalog
  loadAppFloorCatalog: (): Promise<unknown[]> =>
    ipcRenderer.invoke('floorCatalog:loadApp'),

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
