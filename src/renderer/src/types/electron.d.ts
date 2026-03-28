interface Window {
  electronAPI: {
    openFile: () => Promise<{ filePath: string; data: ArrayBuffer } | null>
    saveFile: (defaultName: string) => Promise<string | null>
    writeFile: (filePath: string, data: ArrayBuffer) => Promise<boolean>
  }
}
