import { useEffect, useRef } from 'react'
import { MapRenderer } from '../engine/MapRenderer'
import { InputManager } from '../engine/InputManager'
import { useMapStore } from '../store/mapStore'

export function MapCanvas() {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<MapRenderer | null>(null)
  const inputRef     = useRef<InputManager | null>(null)

  const project       = useMapStore((s) => s.project)
  const activeLevelId = useMapStore((s) => s.activeLevelId)
  const viewMode      = useMapStore((s) => s.viewMode)
  const selectedId    = useMapStore((s) => s.selectedId)

  const activeLevel = useMapStore((s) => {
    const { project, activeLevelId } = s
    if (!project || !activeLevelId) return null
    if (project.overworld.id === activeLevelId) return project.overworld
    return project.dungeonLevels.find((l) => l.id === activeLevelId) ?? null
  })

  // Mount renderer + input manager once
  useEffect(() => {
    if (!canvasRef.current) return
    const renderer = new MapRenderer(canvasRef.current)
    const input    = new InputManager(canvasRef.current, renderer)
    rendererRef.current = renderer
    inputRef.current    = input
    renderer.setViewMode('topdown')
    return () => {
      input.dispose()
      renderer.dispose()
      rendererRef.current = null
      inputRef.current    = null
    }
  }, [])

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

  // Level data changes → full re-render
  useEffect(() => {
    if (!activeLevel) return
    rendererRef.current?.loadLevel(activeLevel)
    // Re-apply selection overlay after re-render
    const { selectedId } = useMapStore.getState()
    rendererRef.current?.setSelection(selectedId)
  }, [activeLevel])

  // Selection changes (from tree nav, keyboard, etc.) → sync renderer
  useEffect(() => {
    rendererRef.current?.setSelection(selectedId)
  }, [selectedId])

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas ref={canvasRef} className="map-canvas" />
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
}
