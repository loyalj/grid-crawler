import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // File system
  openFile: (): Promise<{ filePath: string; data: ArrayBuffer } | null> =>
    ipcRenderer.invoke('dialog:openFile'),

  saveFile: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', defaultName),

  writeFile: (filePath: string, data: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke('fs:writeFile', filePath, data),

  // Menu actions sent from the main process
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu:action', (_event, action) => callback(action))
  },

  setTitle: (title: string) => ipcRenderer.send('window:setTitle', title),

  // Clean up the listener when the component unmounts
  offMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.removeListener('menu:action', (_event, action) => callback(action))
  }
})
