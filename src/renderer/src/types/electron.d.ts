declare const __APP_VERSION__: string
declare const __APP_ARCH__: string

export type UpdaterStatus =
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; version: string }
  | { state: 'error'; message: string }

interface Window {
  electronAPI: {
    openFile: () => Promise<{ filePath: string; data: ArrayBuffer } | null>
    saveFile: (defaultName: string) => Promise<string | null>
    writeFile: (filePath: string, data: ArrayBuffer) => Promise<boolean>
    loadAppCatalog: () => Promise<unknown[]>
    setTitle: (title: string) => void
    confirmClose: () => void
    setSelectionKind: (kind: 'room' | 'hallway' | 'placement' | null) => void
    onMenuAction:     (callback: (action: string) => void) => void
    offMenuAction:    (callback: (action: string) => void) => void
    checkForUpdates:  () => void
    onUpdaterStatus:  (callback: (status: UpdaterStatus) => void) => void
    offUpdaterStatus: (callback: (status: UpdaterStatus) => void) => void
  }
}
