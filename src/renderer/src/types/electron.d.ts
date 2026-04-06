declare const __APP_VERSION__: string
declare const __APP_ARCH__: string

export type UpdaterStatus =
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; version: string }
  | { state: 'error'; message: string }

interface CatalogAPI {
  getSnapshot:    () => Promise<unknown>
  saveObject:     (obj: unknown) => Promise<void>
  deleteObject:   (id: string, tier: string) => Promise<void>
  saveCategories: (kind: 'token' | 'prop', tier: 'app' | 'project', categories: string[]) => Promise<void>
  exportZip:      (filter: 'all' | 'app' | 'project') => Promise<boolean | null>
  importZip:      (mode: 'merge' | 'replace', tier: 'app' | 'project') => Promise<boolean | null>
  pickSvgFile:    () => Promise<{ name: string; content: string } | null>
  pickImageFile:  () => Promise<{ name: string; dataUrl: string } | null>
  onSnapshot:     (cb: (snapshot: unknown) => void) => void
  offSnapshot:    (cb: (snapshot: unknown) => void) => void
}

interface TextureAPI {
  getSnapshot:    () => Promise<unknown>
  saveTexture:    (tex: unknown) => Promise<void>
  deleteTexture:  (id: string, tier: string) => Promise<void>
  pickImageFile:  () => Promise<{ name: string; dataUrl: string } | null>
  onSnapshot:     (cb: (snapshot: unknown) => void) => void
  offSnapshot:    (cb: (snapshot: unknown) => void) => void
}

interface Window {
  catalogAPI?: CatalogAPI
  textureAPI?: TextureAPI
  electronAPI: {
    openFile: () => Promise<{ filePath: string; data: ArrayBuffer } | null>
    saveFile: (defaultName: string) => Promise<string | null>
    writeFile: (filePath: string, data: ArrayBuffer) => Promise<boolean>
    loadAppCatalog:        () => Promise<unknown[]>
    loadAppTextureCatalog: () => Promise<unknown[]>
    setTitle: (title: string) => void
    confirmClose: () => void
    setSelectionKind: (kind: 'room' | 'hallway' | 'placement' | null) => void
    setViewMode:      (mode: string) => void
    setGridVisible:   (visible: boolean) => void
    openObjectEditor: () => void
    setObjectEditorProjectState: (state: unknown) => void
    onSaveProjectObject:     (cb: (obj: unknown) => void) => void
    onDeleteProjectObject:   (cb: (id: string) => void) => void
    onSaveProjectCategories: (cb: (data: { kind: 'token' | 'prop'; categories: string[] }) => void) => void
    onImportProjectObjects:  (cb: (data: unknown) => void) => void
    onCatalogUpdated:        (cb: (snapshot: unknown) => void) => void
    setKeyBindings:   (bindings: unknown) => void
    // Texture editor project state sync
    setTextureEditorProjectState: (state: unknown) => void
    onSaveProjectTexture:   (cb: (tex: unknown) => void) => void
    onDeleteProjectTexture: (cb: (id: string) => void) => void
    onTextureCatalogUpdated:(cb: (snapshot: unknown) => void) => void
    onMenuAction:     (callback: (action: string) => void) => void
    offMenuAction:    (callback: (action: string) => void) => void
    checkForUpdates:  () => void
    onUpdaterStatus:  (callback: (status: UpdaterStatus) => void) => void
    offUpdaterStatus: (callback: (status: UpdaterStatus) => void) => void
  }
}
