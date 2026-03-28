import { useState } from 'react'
import { MapCanvas } from './components/MapCanvas'
import { Toolbar } from './components/Toolbar'
import { LevelPanel } from './components/LevelPanel'
import { useMapStore } from './store/mapStore'

export default function App() {
  const project = useMapStore((s) => s.project)
  const isDirty = useMapStore((s) => s.isDirty)
  const newProject = useMapStore((s) => s.newProject)

  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newMapName, setNewMapName] = useState('')

  const handleCreate = () => {
    const name = newMapName.trim()
    if (!name) return
    newProject(name)
    setShowNewDialog(false)
    setNewMapName('')
  }

  const handleOpenNewDialog = () => {
    if (isDirty && !confirm('Unsaved changes will be lost. Continue?')) return
    setNewMapName('')
    setShowNewDialog(true)
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">Grid Crawler</span>
        <span className="project-label">
          {project ? `${project.name}${isDirty ? ' ●' : ''}` : 'No map open'}
        </span>
        <nav className="app-nav">
          <button onClick={handleOpenNewDialog}>New Map</button>
          <button disabled={!project} title="Open .map file">Open</button>
          <button disabled={!project || !isDirty} title="Save .map file">Save</button>
          <button disabled={!project} title="Export as PDF">Export PDF</button>
        </nav>
      </header>

      <div className="app-body">
        <aside className="sidebar-left">
          <LevelPanel />
        </aside>

        <main className="canvas-area">
          <MapCanvas />
        </main>

        <aside className="sidebar-right">
          <Toolbar />
        </aside>
      </div>

      {showNewDialog && (
        <div className="dialog-overlay" onClick={() => setShowNewDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>New Map</h2>
            <label>Map name</label>
            <input
              type="text"
              placeholder="e.g. The Sunken Citadel"
              value={newMapName}
              onChange={(e) => setNewMapName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="dialog-actions">
              <button onClick={() => setShowNewDialog(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate} disabled={!newMapName.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
