interface Window {
  electronAPI: {
    openFile: () => Promise<{ filePath: string; data: ArrayBuffer } | null>
    saveFile: (defaultName: string) => Promise<string | null>
    writeFile: (filePath: string, data: ArrayBuffer) => Promise<boolean>
    setTitle: (title: string) => void
    onMenuAction: (callback: (action: string) => void) => void
    offMenuAction: (callback: (action: string) => void) => void
  }
}
