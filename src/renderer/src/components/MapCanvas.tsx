import { useEffect, useRef } from 'react'
import { MapRenderer } from '../engine/MapRenderer'
import { useMapStore } from '../store/mapStore'

export function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<MapRenderer | null>(null)

  const project = useMapStore((s) => s.project)
  const activeLevelId = useMapStore((s) => s.activeLevelId)
  const viewMode = useMapStore((s) => s.viewMode)
  const activeTool = useMapStore((s) => s.activeTool)
  const paintCell = useMapStore((s) => s.paintCell)
  const eraseCell = useMapStore((s) => s.eraseCell)

  const activeLevel = useMapStore((s) => {
    const { project, activeLevelId } = s
    if (!project || !activeLevelId) return null
    if (project.overworld.id === activeLevelId) return project.overworld
    return project.dungeonLevels.find((l) => l.id === activeLevelId) ?? null
  })

  // Mount renderer once
  useEffect(() => {
    if (!canvasRef.current) return
    const r = new MapRenderer(canvasRef.current)
    rendererRef.current = r
    r.setViewMode('topdown')
    return () => {
      r.dispose()
      rendererRef.current = null
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
      activeLevel?.grid.width ?? 48,
      activeLevel?.grid.height ?? 48
    )
  }, [viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Grid changes
  useEffect(() => {
    if (!activeLevel) return
    rendererRef.current?.loadGrid(activeLevel.grid)
  }, [activeLevel])

  // Tool handler
  useEffect(() => {
    rendererRef.current?.setOnCellInteract((x, y) => {
      if (activeTool === 'paint') paintCell(x, y)
      else if (activeTool === 'erase') eraseCell(x, y)
    })
  }, [activeTool, paintCell, eraseCell])

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
