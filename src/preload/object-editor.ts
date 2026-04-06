import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

type SnapshotCallback = (snapshot: unknown) => void
const snapshotWrappers = new WeakMap<SnapshotCallback, (_e: IpcRendererEvent, snap: unknown) => void>()

contextBridge.exposeInMainWorld('catalogAPI', {
  // Fetch the current full catalog snapshot from main process
  getSnapshot: (): Promise<unknown> =>
    ipcRenderer.invoke('objectEditor:getSnapshot'),

  // CRUD
  saveObject: (obj: unknown): Promise<void> =>
    ipcRenderer.invoke('objectEditor:saveObject', obj),

  deleteObject: (id: string, tier: string): Promise<void> =>
    ipcRenderer.invoke('objectEditor:deleteObject', id, tier),

  saveCategories: (kind: 'token' | 'prop', tier: 'app' | 'project', categories: string[]): Promise<void> =>
    ipcRenderer.invoke('objectEditor:saveCategories', kind, tier, categories),

  // Import / Export
  exportZip: (filter: 'all' | 'app' | 'project'): Promise<boolean | null> =>
    ipcRenderer.invoke('objectEditor:exportZip', filter),

  importZip: (mode: 'merge' | 'replace', tier: 'app' | 'project'): Promise<boolean | null> =>
    ipcRenderer.invoke('objectEditor:importZip', mode, tier),

  // File pickers
  pickSvgFile: (): Promise<{ name: string; content: string } | null> =>
    ipcRenderer.invoke('objectEditor:pickSvgFile'),

  pickImageFile: (): Promise<{ name: string; dataUrl: string } | null> =>
    ipcRenderer.invoke('objectEditor:pickImageFile'),

  // Listen for snapshot pushes from main (project changes, catalog updates)
  onSnapshot: (cb: SnapshotCallback): void => {
    const wrapper = (_e: IpcRendererEvent, snap: unknown) => cb(snap)
    snapshotWrappers.set(cb, wrapper)
    ipcRenderer.on('objectEditor:snapshot', wrapper)
  },

  offSnapshot: (cb: SnapshotCallback): void => {
    const wrapper = snapshotWrappers.get(cb)
    if (wrapper) {
      ipcRenderer.removeListener('objectEditor:snapshot', wrapper)
      snapshotWrappers.delete(cb)
    }
  }
})
