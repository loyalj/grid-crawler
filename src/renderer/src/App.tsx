import { useEffect, useState } from 'react'
import { Modal, TextInput, NumberInput, Group, Button, Stack } from '@mantine/core'
import { MapCanvas } from './components/MapCanvas'
import { Toolbar } from './components/Toolbar'
import { LevelNav } from './components/LevelNav'
import { DetailsPanel } from './components/DetailsPanel'
import { useMapStore } from './store/mapStore'

export default function App() {
  const project     = useMapStore((s) => s.project)
  const isDirty     = useMapStore((s) => s.isDirty)
  const newProject  = useMapStore((s) => s.newProject)
  const setViewMode = useMapStore((s) => s.setViewMode)

  const [showNew, setShowNew]     = useState(false)
  const [mapName, setMapName]     = useState('')
  const [mapWidth, setMapWidth]   = useState<number>(32)
  const [mapHeight, setMapHeight] = useState<number>(32)

  const handleCreate = () => {
    const name = mapName.trim()
    if (!name) return
    newProject(name, mapWidth, mapHeight)
    setShowNew(false)
    setMapName('')
  }

  const openNew = () => {
    if (isDirty && !confirm('Unsaved changes will be lost. Continue?')) return
    setMapName('')
    setShowNew(true)
  }

  useEffect(() => {
    window.electronAPI.setTitle(project ? `Grid Crawler - ${project.name}` : 'Grid Crawler')
  }, [project?.name])

  useEffect(() => {
    const handler = (action: string) => {
      switch (action) {
        case 'file:new':       openNew();                  break
        case 'file:open':                                  break
        case 'file:save':                                  break
        case 'file:saveAs':                                break
        case 'file:exportPdf':                             break
        case 'view:topdown':   setViewMode('topdown');     break
        case 'view:isometric': setViewMode('isometric');   break
        case 'view:fps':       setViewMode('fps');         break
      }
    }
    window.electronAPI.onMenuAction(handler)
    return () => window.electronAPI.offMenuAction(handler)
  }, [isDirty, newProject, setViewMode])

  return (
    <div className="app">
      <div className="app-body">
        <aside className="sidebar-left">
          <LevelNav />
        </aside>

        <div className="main-column">
          <Toolbar />

          <div className="content-row">
            <main className="canvas-area">
              <MapCanvas />
            </main>

            <aside className="sidebar-right">
              <DetailsPanel />
            </aside>
          </div>
        </div>
      </div>

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
