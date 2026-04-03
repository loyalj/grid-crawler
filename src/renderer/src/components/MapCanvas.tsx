import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { MapRenderer } from '../engine/MapRenderer'
import { InputManager, ContextMenuPayload, ContextMenuAction } from '../engine/InputManager'
import { useMapStore } from '../store/mapStore'
import { useAppSettings } from '../store/appSettingsStore'
import { ContextMenu } from './ContextMenu'
import { UpdateHallwayWaypointsCommand, RemoveHallwayCommand, RemoveRoomCommand, RemoveObjectCommand } from '../engine/commands'

export interface MapCanvasHandle {
  undo:  () => void
  redo:  () => void
  copy:  () => void
  cut:   () => void
  paste: () => void
}

export const MapCanvas = forwardRef<MapCanvasHandle>(function MapCanvas(_, ref) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<MapRenderer | null>(null)
  const inputRef     = useRef<InputManager | null>(null)

  const project       = useMapStore((s) => s.project)
  const activeLevelId = useMapStore((s) => s.activeLevelId)
  const viewMode      = useMapStore((s) => s.viewMode)
  const selectedId    = useMapStore((s) => s.selectedId)
  const activeTool         = useMapStore((s) => s.activeTool)
  const appCatalog         = useMapStore((s) => s.appCatalog)
  const armedDefinitionId  = useMapStore((s) => s.armedDefinitionId)

  const gridVisible      = useAppSettings((s) => s.gridVisible)
  const gridColor        = useAppSettings((s) => s.gridColor)
  const gridOpacity      = useAppSettings((s) => s.gridOpacity)
  const snapToGrid       = useAppSettings((s) => s.snapToGrid)
  const canvasBackground = useAppSettings((s) => s.canvasBackground)

  const activeLevel = useMapStore((s) => {
    const { project, activeLevelId } = s
    if (!project || !activeLevelId) return null
    if (project.overworld.id === activeLevelId) return project.overworld
    return project.dungeonLevels.find((l) => l.id === activeLevelId) ?? null
  })

  const [contextMenu, setContextMenu] = useState<ContextMenuPayload | null>(null)

  // Mount renderer + input manager once
  useEffect(() => {
    if (!canvasRef.current) return
    const { gridVisible, gridColor, gridOpacity, canvasBackground } = useAppSettings.getState()
    const renderer = new MapRenderer(canvasRef.current)
    const input    = new InputManager(canvasRef.current, renderer, setContextMenu)
    rendererRef.current = renderer
    inputRef.current    = input
    renderer.setViewMode('topdown')
    renderer.setGridSettings(gridVisible, gridColor, gridOpacity)
    renderer.setBackground(canvasBackground)
    return () => {
      input.dispose()
      renderer.dispose()
      rendererRef.current = null
      inputRef.current    = null
    }
  }, [])

  // Sync grid settings to renderer when they change
  useEffect(() => {
    rendererRef.current?.setGridSettings(gridVisible, gridColor, gridOpacity)
  }, [gridVisible, gridColor, gridOpacity])

  // Sync canvas background to renderer when it changes
  useEffect(() => {
    rendererRef.current?.setBackground(canvasBackground)
  }, [canvasBackground])

  // Sync snap-to-grid into InputManager when it changes
  useEffect(() => {
    inputRef.current?.setSnapToGrid(snapToGrid)
  }, [snapToGrid])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      rendererRef.current?.resize(width, height)
    })
    obs.observe(container)
    return () => obs.disconnect()
  }, [])

  // View mode changes
  useEffect(() => {
    rendererRef.current?.setViewMode(
      viewMode,
      activeLevel?.settings.gridWidth  ?? 48,
      activeLevel?.settings.gridHeight ?? 48
    )
  }, [viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tool changes from the toolbar → cancel any in-progress interaction
  useEffect(() => {
    inputRef.current?.cancelCurrentInteraction()
  }, [activeTool])

  // Armed definition changes → rebuild placement ghost (or clear it)
  useEffect(() => {
    if (activeTool !== 'object' || !armedDefinitionId) {
      rendererRef.current?.clearPlacementGhost()
      return
    }
    const { appCatalog, project } = useMapStore.getState()
    const allDefs = [...appCatalog, ...(project?.projectCatalog ?? [])]
    const def = allDefs.find((d) => d.id === armedDefinitionId) ?? null
    rendererRef.current?.setPlacementGhost(def)
  }, [activeTool, armedDefinitionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Catalog changes → push to renderer (before any loadLevel call)
  useEffect(() => {
    const { project } = useMapStore.getState()
    const merged = [...appCatalog, ...(project?.projectCatalog ?? [])]
    rendererRef.current?.setCatalog(merged)
  }, [appCatalog])

  // Level data changes → full re-render
  useEffect(() => {
    if (!activeLevel) return
    // Ensure catalog is current before rendering objects
    const { appCatalog, project } = useMapStore.getState()
    rendererRef.current?.setCatalog([...appCatalog, ...(project?.projectCatalog ?? [])])
    rendererRef.current?.loadLevel(activeLevel)
    // Re-apply selection overlay after re-render
    const { selectedId } = useMapStore.getState()
    rendererRef.current?.setSelection(selectedId)
  }, [activeLevel])

  // Selection changes (from tree nav, keyboard, etc.) → sync renderer
  useEffect(() => {
    rendererRef.current?.setSelection(selectedId)
  }, [selectedId])

  // Notify main process of selection kind so it can enable/disable copy+cut in the menu
  useEffect(() => {
    if (!selectedId || !activeLevel) {
      window.electronAPI.setSelectionKind(null)
      return
    }
    if (activeLevel.rooms.find((r) => r.id === selectedId))
      window.electronAPI.setSelectionKind('room')
    else if (activeLevel.hallways.find((h) => h.id === selectedId))
      window.electronAPI.setSelectionKind('hallway')
    else
      window.electronAPI.setSelectionKind('placement')
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleContextAction(action: ContextMenuAction): void {
    const store = useMapStore.getState()
    const { activeLevelId } = store
    if (!activeLevelId) return
    const level = (() => {
      const { project } = store
      if (!project) return null
      if (project.overworld.id === activeLevelId) return project.overworld
      return project.dungeonLevels.find((l) => l.id === activeLevelId) ?? null
    })()
    if (!level) return

    switch (action.kind) {
      case 'copy_room':
      case 'copy_object':
        inputRef.current?.copy()
        break
      case 'cut_room':
      case 'cut_object':
        inputRef.current?.cut()
        break
      case 'add_waypoint': {
        const hallway = level.hallways.find((h) => h.id === action.hallwayId)
        if (!hallway) return
        const newWaypoints = [...hallway.waypoints, { x: action.col, y: action.row }]
        store.dispatch(new UpdateHallwayWaypointsCommand(
          activeLevelId, action.hallwayId, hallway.waypoints, newWaypoints
        ))
        break
      }
      case 'remove_waypoint': {
        const hallway = level.hallways.find((h) => h.id === action.hallwayId)
        if (!hallway) return
        const newWaypoints = hallway.waypoints.filter((_, i) => i !== action.waypointIndex)
        store.dispatch(new UpdateHallwayWaypointsCommand(
          activeLevelId, action.hallwayId, hallway.waypoints, newWaypoints
        ))
        break
      }
      case 'delete_hallway': {
        const hallway = level.hallways.find((h) => h.id === action.hallwayId)
        if (!hallway) return
        store.dispatch(new RemoveHallwayCommand(activeLevelId, hallway))
        store.setSelected(null)
        rendererRef.current?.setSelection(null)
        break
      }
      case 'delete_room': {
        const room = level.rooms.find((r) => r.id === action.roomId)
        if (!room) return
        store.dispatch(new RemoveRoomCommand(activeLevelId, room))
        store.setSelected(null)
        rendererRef.current?.setSelection(null)
        break
      }
      case 'delete_level':
        break  // only triggered from the nav tree, not the canvas
      case 'delete_object': {
        const placement = level?.placements.find((p) => p.id === action.placementId)
        if (!placement) return
        store.dispatch(new RemoveObjectCommand(activeLevelId, placement))
        store.setSelected(null)
        break
      }
      case 'paste':
        inputRef.current?.pasteAt(action.col, action.row, action.fx, action.fy)
        break
    }
  }

  useImperativeHandle(ref, () => ({
    undo:  () => inputRef.current?.triggerUndo(),
    redo:  () => inputRef.current?.triggerRedo(),
    copy:  () => inputRef.current?.copy(),
    cut:   () => inputRef.current?.cut(),
    paste: () => inputRef.current?.paste(),
  }))

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas ref={canvasRef} className="map-canvas" />
      {contextMenu && (
        <ContextMenu
          screenX={contextMenu.screenX}
          screenY={contextMenu.screenY}
          items={contextMenu.items}
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}
      {!project && (
        <div className="canvas-empty">
          <div className="canvas-empty-text">
            <strong>No map open</strong>
            <span>Use File → New Map to get started</span>
          </div>
        </div>
      )}
      {project && !activeLevelId && (
        <div className="canvas-empty">
          <div className="canvas-empty-text">Select a level to begin editing</div>
        </div>
      )}
    </div>
  )
})
