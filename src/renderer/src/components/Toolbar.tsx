import { useMapStore, EditorTool, ViewMode } from '../store/mapStore'
import { CellType } from '../types/map'

const TOOLS: Array<{ id: EditorTool; label: string; hint: string }> = [
  { id: 'paint', label: 'Paint', hint: 'Left-click / drag to paint cells' },
  { id: 'erase', label: 'Erase', hint: 'Left-click / drag to erase cells' },
  { id: 'select', label: 'Select', hint: 'Select rooms or regions' },
  { id: 'fill', label: 'Fill', hint: 'Flood-fill a region' }
]

const VIEW_MODES: Array<{ id: ViewMode; label: string }> = [
  { id: 'topdown', label: '2D Top-Down' },
  { id: 'isometric', label: 'Isometric' },
  { id: 'fps', label: 'FPS Walkthrough' }
]

const CELL_TYPES: Array<{ type: CellType; label: string; color: string }> = [
  { type: 'floor',       label: 'Floor',       color: '#4a3f35' },
  { type: 'wall',        label: 'Wall',        color: '#6b6b6b' },
  { type: 'door',        label: 'Door',        color: '#8b4513' },
  { type: 'secret_door', label: 'Secret Door', color: '#5a5a5a' },
  { type: 'stairs_up',   label: 'Stairs Up',   color: '#7b9eae' },
  { type: 'stairs_down', label: 'Stairs Down', color: '#4e7a8c' },
  { type: 'water',       label: 'Water',       color: '#1a6b8a' },
  { type: 'lava',        label: 'Lava',        color: '#cc3300' },
  { type: 'pit',         label: 'Pit',         color: '#111' },
  { type: 'rubble',      label: 'Rubble',      color: '#5a5a4a' },
  { type: 'pillar',      label: 'Pillar',      color: '#888888' }
]

export function Toolbar() {
  const project = useMapStore((s) => s.project)
  const activeTool = useMapStore((s) => s.activeTool)
  const activeCellType = useMapStore((s) => s.activeCellType)
  const viewMode = useMapStore((s) => s.viewMode)
  const setActiveTool = useMapStore((s) => s.setActiveTool)
  const setActiveCellType = useMapStore((s) => s.setActiveCellType)
  const setViewMode = useMapStore((s) => s.setViewMode)

  const disabled = !project

  return (
    <div className="toolbar">
      <section className="toolbar-section">
        <h3>View</h3>
        {VIEW_MODES.map((vm) => (
          <button
            key={vm.id}
            className={`tool-btn ${viewMode === vm.id ? 'active' : ''}`}
            onClick={() => setViewMode(vm.id)}
            disabled={disabled}
          >
            {vm.label}
          </button>
        ))}
      </section>

      <section className="toolbar-section">
        <h3>Tools</h3>
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
            title={tool.hint}
            onClick={() => setActiveTool(tool.id)}
            disabled={disabled}
          >
            {tool.label}
          </button>
        ))}
      </section>

      <section className="toolbar-section">
        <h3>Tile</h3>
        {CELL_TYPES.map((ct) => (
          <button
            key={ct.type}
            className={`tool-btn tile-btn ${activeCellType === ct.type ? 'active' : ''}`}
            onClick={() => setActiveCellType(ct.type)}
            disabled={disabled || activeTool !== 'paint'}
            style={{ '--tile-color': ct.color } as React.CSSProperties}
          >
            <span className="tile-swatch" />
            {ct.label}
          </button>
        ))}
      </section>
    </div>
  )
}
