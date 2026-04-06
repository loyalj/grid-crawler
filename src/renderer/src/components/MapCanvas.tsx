import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { MapRenderer } from '../engine/MapRenderer'
import { InputManager, ContextMenuPayload, ContextMenuAction } from '../engine/InputManager'
import { useMapStore } from '../store/mapStore'
import { useAppSettings } from '../store/appSettingsStore'
import { ContextMenu } from './ContextMenu'
import { UpdateHallwayWaypointsCommand, RemoveHallwayCommand, RemoveRoomCommand, RemoveObjectCommand, RemovePlayerCommand, UpdatePlayerPlacementCommand } from '../engine/commands'

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
  const selectedPlayerId  = useMapStore((s) => s.selectedPlayerId)
  const activeTool        = useMapStore((s) => s.activeTool)
  const appCatalog        = useMapStore((s) => s.appCatalog)
  const appTextureCatalog = useMapStore((s) => s.appTextureCatalog)
  const armedDefinitionId = useMapStore((s) => s.armedDefinitionId)
  const armedPlayerId     = useMapStore((s) => s.armedPlayerId)

  const gridVisible      = useAppSettings((s) => s.gridVisible)
  const gridColor        = useAppSettings((s) => s.gridColor)
  const gridOpacity      = useAppSettings((s) => s.gridOpacity)
  const snapToGrid       = useAppSettings((s) => s.snapToGrid)
  const canvasBackground = useAppSettings((s) => s.canvasBackground)
  const keyBindings      = useAppSettings((s) => s.keyBindings)

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
    renderer.setViewMode('layout')
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

  // Sync keybindings to main process so the menu can show accelerators
  useEffect(() => {
    window.electronAPI.setKeyBindings(keyBindings)
  }, [keyBindings])

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

  // While in FPS mode, exit back to previous view when pointer lock is released
  useEffect(() => {
    if (viewMode !== 'fps') return
    const handle = () => {
      if (!document.pointerLockElement) {
        const s = useMapStore.getState()
        s.setViewMode(s.previousViewMode)
      }
    }
    document.addEventListener('pointerlockchange', handle)
    return () => document.removeEventListener('pointerlockchange', handle)
  }, [viewMode])

  // View mode changes → renderer re-renders with current mode
  useEffect(() => {
    if (viewMode === 'fps') {
      // Compute spawn: selected player's placement, or center of first room, or level center
      const { project, activeLevelId, selectedPlayerId } = useMapStore.getState()
      const level = project && activeLevelId
        ? (project.overworld.id === activeLevelId ? project.overworld : project.dungeonLevels.find((l) => l.id === activeLevelId))
        : null
      let spawnX: number | undefined
      let spawnZ: number | undefined
      if (selectedPlayerId && project) {
        const player = project.players.find((p) => p.id === selectedPlayerId)
        if (player?.placement && player.placement.levelId === activeLevelId) {
          spawnX = player.placement.x
          spawnZ = player.placement.y
        }
      }
      if (spawnX === undefined && level?.rooms.length) {
        const r = level.rooms[0]
        spawnX = (r.x + r.width  / 2)
        spawnZ = (r.y + r.height / 2)
      }
      rendererRef.current?.setViewMode(viewMode, spawnX, spawnZ)
    } else {
      rendererRef.current?.setViewMode(viewMode)
    }
    window.electronAPI.setViewMode(viewMode)
  }, [viewMode])

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

  // Floor catalog changes → push combined app + project textures to renderer
  // Texture catalog changes → push combined app + project textures to renderer
  useEffect(() => {
    const { project } = useMapStore.getState()
    const merged = [...appTextureCatalog, ...(project?.projectTextures ?? [])]
    rendererRef.current?.setTextureCatalog(merged)
  }, [appTextureCatalog])

  // Level data changes → full re-render
  useEffect(() => {
    if (!activeLevel) return
    // Ensure catalog and players are current before rendering
    const { appCatalog, project } = useMapStore.getState()
    rendererRef.current?.setCatalog([...appCatalog, ...(project?.projectCatalog ?? [])])
    rendererRef.current?.setPlayers(project?.players ?? [])
    rendererRef.current?.loadLevel(activeLevel)
    // Re-apply selection overlay after re-render
    const { selectedId, selectedPlayerId } = useMapStore.getState()
    rendererRef.current?.setSelection(selectedId)
    const player = selectedPlayerId
      ? (project?.players.find((p) => p.id === selectedPlayerId) ?? null)
      : null
    rendererRef.current?.setPlayerSelection(player)
  }, [activeLevel])

  // Players list changes → update renderer and re-render level (players are part of the scene)
  useEffect(() => {
    const { selectedPlayerId } = useMapStore.getState()
    const players = project?.players ?? []
    rendererRef.current?.setPlayers(players)
    if (activeLevel) rendererRef.current?.loadLevel(activeLevel)
    // Re-apply player selection after full reload
    const player = selectedPlayerId
      ? (players.find((p) => p.id === selectedPlayerId) ?? null)
      : null
    rendererRef.current?.setPlayerSelection(player)
  }, [project?.players]) // eslint-disable-line react-hooks/exhaustive-deps

  // Player selection → sync renderer highlight
  useEffect(() => {
    const player = selectedPlayerId
      ? (useMapStore.getState().project?.players.find((p) => p.id === selectedPlayerId) ?? null)
      : null
    rendererRef.current?.setPlayerSelection(player)
  }, [selectedPlayerId])

  // Armed player → build/clear ghost token
  useEffect(() => {
    if (!armedPlayerId) {
      rendererRef.current?.clearPlayerGhost()
      return
    }
    const player = useMapStore.getState().project?.players.find((p) => p.id === armedPlayerId) ?? null
    rendererRef.current?.setPlayerGhost(player)
  }, [armedPlayerId])

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
      case 'unplace_player': {
        store.dispatch(new UpdatePlayerPlacementCommand(action.playerId, null))
        store.setSelectedPlayer(action.playerId)
        rendererRef.current?.setSelection(null)
        break
      }
      case 'cut_player': {
        // Unplace the player (remove from map) but keep them in the players list
        store.dispatch(new UpdatePlayerPlacementCommand(action.playerId, null))
        store.setClipboard({ kind: 'player', playerId: action.playerId })
        store.setSelectedPlayer(action.playerId)
        rendererRef.current?.setSelection(null)
        break
      }
      case 'paste_player': {
        const { activeLevelId } = store
        if (!activeLevelId) break
        store.dispatch(new UpdatePlayerPlacementCommand(action.playerId, { levelId: activeLevelId, x: action.fx, y: action.fy }))
        store.setClipboard(null)
        store.setSelectedPlayer(action.playerId)
        rendererRef.current?.setSelection(null)
        break
      }
      case 'delete_player': {
        store.dispatch(new RemovePlayerCommand(action.playerId))
        store.setSelectedPlayer(null)
        rendererRef.current?.setSelection(null)
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
