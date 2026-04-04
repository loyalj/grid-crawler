import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, TextInput, NumberInput, Group, Button, Stack } from '@mantine/core'
import { generateMapName } from './data/mapNames'
import { MapCanvas, MapCanvasHandle } from './components/MapCanvas'
import { Toolbar } from './components/Toolbar'
import { SideNav } from './components/SideNav'
import { DetailsPanel } from './components/DetailsPanel'
import { SettingsContent } from './components/SettingsPanel'
import { AboutModal } from './components/AboutModal'
import { useMapStore } from './store/mapStore'
import { ObjectDefinition } from './types/map'
import { buildCrwlBuffer, parseCrwlBuffer } from './engine/projectFile'

export default function App() {
  const project        = useMapStore((s) => s.project)
  const isDirty        = useMapStore((s) => s.isDirty)
  const newProject     = useMapStore((s) => s.newProject)
  const setProject     = useMapStore((s) => s.setProject)
  const markSaved      = useMapStore((s) => s.markSaved)
  const setViewMode    = useMapStore((s) => s.setViewMode)
  const setAppCatalog      = useMapStore((s) => s.setAppCatalog)
  const setAppFloorCatalog = useMapStore((s) => s.setAppFloorCatalog)
  const navSection     = useMapStore((s) => s.navSection)

  // Right panel resize
  const [rightPanelWidth, setRightPanelWidth] = useState(190)
  const isDraggingRight = useRef(false)
  const dragStartX      = useRef(0)
  const dragStartWidth  = useRef(0)

  const onRightHandleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRight.current = true
    dragStartX.current      = e.clientX
    dragStartWidth.current  = rightPanelWidth
    e.preventDefault()
  }, [rightPanelWidth])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDraggingRight.current) return
      const delta    = dragStartX.current - e.clientX
      const newWidth = Math.min(500, Math.max(160, dragStartWidth.current + delta))
      setRightPanelWidth(newWidth)
    }
    function onMouseUp() { isDraggingRight.current = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [])

  // Tracks the file path of the currently open document (null = unsaved)
  const mapCanvasRef          = useRef<MapCanvasHandle>(null)
  const currentFilePathRef    = useRef<string | null>(null)
  // Guards against re-entrant file-op dialogs
  const fileOpInProgressRef   = useRef(false)
  // Guards against the window close event firing twice on Windows
  const closeInProgressRef    = useRef(false)

  // Set initial window title (no project open yet)
  useEffect(() => { updateTitle(null, false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load app catalogs once on mount
  useEffect(() => {
    window.electronAPI.loadAppCatalog().then((raw) => {
      setAppCatalog(raw as ObjectDefinition[])
    }).catch((e) => console.warn('[App] failed to load app catalog:', e))
    window.electronAPI.loadAppFloorCatalog().then((raw) => {
      setAppFloorCatalog(raw as import('./types/map').FloorTextureDefinition[])
    }).catch((e) => console.warn('[App] failed to load floor catalog:', e))
  }, [setAppCatalog, setAppFloorCatalog])

  const [showAbout, setShowAbout] = useState(false)
  const [showNew, setShowNew]     = useState(false)
  const [mapName, setMapName]     = useState('')
  const [mapWidth, setMapWidth]   = useState<number>(32)
  const [mapHeight, setMapHeight] = useState<number>(32)

  // Unsaved-changes confirmation modal
  const [showUnsaved, setShowUnsaved] = useState(false)
  const unsavedResolveRef = useRef<((result: 'save' | 'discard' | 'cancel') => void) | null>(null)

  function promptUnsaved(): Promise<'save' | 'discard' | 'cancel'> {
    return new Promise((resolve) => {
      unsavedResolveRef.current = resolve
      setShowUnsaved(true)
    })
  }

  function resolveUnsaved(result: 'save' | 'discard' | 'cancel'): void {
    setShowUnsaved(false)
    unsavedResolveRef.current?.(result)
    unsavedResolveRef.current = null
  }

  const handleCreate = () => {
    const name = mapName.trim()
    if (!name) return
    newProject(name, mapWidth, mapHeight)
    updateTitle(null)
    setShowNew(false)
    setMapName('')
  }

  function updateTitle(filePath: string | null, hasProject = true): void {
    if (!hasProject) { window.electronAPI.setTitle('Grid Crawler'); return }
    const fileName = filePath ? (filePath.split(/[\\/]/).pop() ?? filePath) : 'Unsaved'
    window.electronAPI.setTitle(`Grid Crawler - ${fileName}`)
  }

  async function doSave(filePath: string): Promise<void> {
    const { project } = useMapStore.getState()
    if (!project) return
    const buffer = await buildCrwlBuffer(project)
    await window.electronAPI.writeFile(filePath, buffer)
    markSaved()
    updateTitle(filePath)
  }

  /**
   * If the project is dirty, asks the user to save first.
   * Returns true if it's safe to proceed (not dirty, or saved successfully).
   * Returns false if the user cancelled (caller should abort their action).
   */
  async function saveIfDirty(): Promise<boolean> {
    const { isDirty, project } = useMapStore.getState()
    if (!isDirty) return true

    const result = await promptUnsaved()
    if (result === 'cancel') return false
    if (result === 'discard') return true

    // result === 'save'
    const path = currentFilePathRef.current
    if (path) {
      await doSave(path)
      return true
    }
    if (!project) return true
    const filePath = await window.electronAPI.saveFile(`${project.name}.crwl`)
    if (!filePath) return false
    currentFilePathRef.current = filePath
    await doSave(filePath)
    return true
  }

  async function openNew(): Promise<void> {
    if (fileOpInProgressRef.current) return
    fileOpInProgressRef.current = true
    try {
      if (!await saveIfDirty()) return
      currentFilePathRef.current = null
      setMapName('')
      setShowNew(true)
    } finally {
      fileOpInProgressRef.current = false
    }
  }

  async function handleSaveAs(): Promise<void> {
    if (fileOpInProgressRef.current) return
    fileOpInProgressRef.current = true
    try {
      const { project } = useMapStore.getState()
      if (!project) return
      const filePath = await window.electronAPI.saveFile(`${project.name}.crwl`)
      if (!filePath) return
      currentFilePathRef.current = filePath
      await doSave(filePath)
    } finally {
      fileOpInProgressRef.current = false
    }
  }

  async function handleSave(): Promise<void> {
    if (fileOpInProgressRef.current) return
    if (currentFilePathRef.current) {
      fileOpInProgressRef.current = true
      try {
        await doSave(currentFilePathRef.current)
      } finally {
        fileOpInProgressRef.current = false
      }
    } else {
      await handleSaveAs()
    }
  }

  async function handleOpen(): Promise<void> {
    if (fileOpInProgressRef.current) return
    fileOpInProgressRef.current = true
    try {
      if (!await saveIfDirty()) return
      const result = await window.electronAPI.openFile()
      if (!result) return
      const project = await parseCrwlBuffer(result.data)
      currentFilePathRef.current = result.filePath
      updateTitle(result.filePath)
      setProject(project)
    } catch (e) {
      console.error('[App] failed to open .crwl file:', e)
      alert('Failed to open file. It may be corrupt or an unsupported format.')
    } finally {
      fileOpInProgressRef.current = false
    }
  }

  async function handleBeforeClose(): Promise<void> {
    if (closeInProgressRef.current) return
    closeInProgressRef.current = true
    try {
      if (await saveIfDirty()) window.electronAPI.confirmClose()
    } finally {
      closeInProgressRef.current = false
    }
  }

  useEffect(() => {
    const handler = (action: string) => {
      switch (action) {
        case 'file:new':       openNew();          break
        case 'file:open':      handleOpen();       break
        case 'file:save':      handleSave();       break
        case 'file:saveAs':    handleSaveAs();     break
        case 'edit:undo':        mapCanvasRef.current?.undo();  break
        case 'edit:redo':        mapCanvasRef.current?.redo();  break
        case 'edit:copy':        mapCanvasRef.current?.copy();  break
        case 'edit:cut':         mapCanvasRef.current?.cut();   break
        case 'edit:paste':       mapCanvasRef.current?.paste(); break
        case 'app:about':        setShowAbout(true);            break
        case 'app:beforeClose':  handleBeforeClose();           break
        case 'file:exportPdf':                             break
        case 'view:layout':    setViewMode('layout');      break
        case 'view:textured':  setViewMode('textured');    break
        case 'view:isometric': setViewMode('isometric');   break
        case 'view:fps':       setViewMode('fps');         break
      }
    }
    window.electronAPI.onMenuAction(handler)
    return () => window.electronAPI.offMenuAction(handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <div className="app-body">
        <aside className="sidebar-left">
          <SideNav />
        </aside>

        <div className="main-column">
          {navSection === 'settings' ? (
            <SettingsContent />
          ) : (
            <>
              <Toolbar />
              <div className="content-row">
                <main className="canvas-area">
                  <MapCanvas ref={mapCanvasRef} />
                </main>
                <div className="resize-handle-right" onMouseDown={onRightHandleMouseDown} />
                <aside className="sidebar-right" style={{ width: rightPanelWidth }}>
                  <DetailsPanel />
                </aside>
              </div>
            </>
          )}
        </div>
      </div>

      <AboutModal opened={showAbout} onClose={() => setShowAbout(false)} />

      <Modal
        opened={showUnsaved}
        onClose={() => resolveUnsaved('cancel')}
        title="Unsaved Changes"
        centered
        size="sm"
        withCloseButton={false}
      >
        <Stack gap="sm">
          <p style={{ margin: 0 }}>You have unsaved changes. What would you like to do?</p>
          <Group justify="flex-end" mt="xs">
            <Button onClick={() => resolveUnsaved('save')}>Save</Button>
            <Button variant="default" onClick={() => resolveUnsaved('discard')}>Don't Save</Button>
            <Button variant="subtle" onClick={() => resolveUnsaved('cancel')}>Cancel</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={showNew}
        onClose={() => setShowNew(false)}
        title="New Map"
        centered
        size="sm"
      >
        <Stack gap="sm">
          <TextInput
            label="Map name"
            placeholder="e.g. The Sunken Citadel"
            value={mapName}
            onChange={(e) => setMapName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            data-autofocus
            rightSection={
              <button
                type="button"
                title="Generate random name"
                onClick={() => setMapName(generateMapName())}
                style={{
                  all: 'unset', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 4,
                  color: 'var(--mantine-color-dimmed)',
                  transition: 'color 80ms ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--mantine-color-teal-4)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mantine-color-dimmed)')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1.5" y="1.5" width="13" height="13" rx="2.5"/>
                  <circle cx="5" cy="5"  r="0.8" fill="currentColor" stroke="none"/>
                  <circle cx="11" cy="5"  r="0.8" fill="currentColor" stroke="none"/>
                  <circle cx="5" cy="11" r="0.8" fill="currentColor" stroke="none"/>
                  <circle cx="11" cy="11" r="0.8" fill="currentColor" stroke="none"/>
                  <circle cx="8" cy="8"  r="0.8" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            }
            rightSectionWidth={36}
          />
          <Group grow>
            <NumberInput
              label="Width (cells)"
              min={4}
              max={256}
              value={mapWidth}
              onChange={(v) => setMapWidth(typeof v === 'number' ? v : 32)}
            />
            <NumberInput
              label="Height (cells)"
              min={4}
              max={256}
              value={mapHeight}
              onChange={(v) => setMapHeight(typeof v === 'number' ? v : 32)}
            />
          </Group>
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!mapName.trim()}>Create</Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  )
}
