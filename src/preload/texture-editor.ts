import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

type SnapshotCallback = (snapshot: unknown) => void
const snapshotWrappers = new WeakMap<SnapshotCallback, (_e: IpcRendererEvent, snap: unknown) => void>()

contextBridge.exposeInMainWorld('textureAPI', {
  getSnapshot: (): Promise<unknown> =>
    ipcRenderer.invoke('textureEditor:getSnapshot'),

  saveTexture: (tex: unknown): Promise<void> =>
    ipcRenderer.invoke('textureEditor:saveTexture', tex),

  deleteTexture: (id: string, tier: string): Promise<void> =>
    ipcRenderer.invoke('textureEditor:deleteTexture', id, tier),

  pickImageFile: (): Promise<{ name: string; dataUrl: string } | null> =>
    ipcRenderer.invoke('textureEditor:pickImageFile'),

  onSnapshot: (cb: SnapshotCallback): void => {
    const wrapper = (_e: IpcRendererEvent, snap: unknown) => cb(snap)
    snapshotWrappers.set(cb, wrapper)
    ipcRenderer.on('textureEditor:snapshot', wrapper)
  },

  offSnapshot: (cb: SnapshotCallback): void => {
    const wrapper = snapshotWrappers.get(cb)
    if (wrapper) {
      ipcRenderer.removeListener('textureEditor:snapshot', wrapper)
      snapshotWrappers.delete(cb)
    }
  }
})
