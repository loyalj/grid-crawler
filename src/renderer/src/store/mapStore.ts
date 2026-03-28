import { create } from 'zustand'
import { MapProject, Level, CellType, Grid } from '../types/map'

export type ViewMode = 'topdown' | 'isometric' | 'fps'
export type EditorTool = 'paint' | 'erase' | 'select' | 'fill'

function createEmptyGrid(width: number, height: number): Grid {
  return {
    width,
    height,
    cells: Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ type: 'empty' as CellType }))
    )
  }
}

function createNewLevel(name: string, depth: number): Level {
  return {
    id: crypto.randomUUID(),
    name,
    depth,
    metadata: {},
    grid: createEmptyGrid(48, 48),
    rooms: [],
    hallways: [],
    placements: []
  }
}

function createNewProject(name: string): MapProject {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    version: '1.0.0',
    createdAt: now,
    updatedAt: now,
    metadata: {},
    catalog: { items: [], entities: [] },
    overworld: createNewLevel('Overworld', 0),
    dungeonLevels: [createNewLevel('Level 1', 1)]
  }
}

interface MapStore {
  project: MapProject | null
  isDirty: boolean
  activeLevelId: string | null
  viewMode: ViewMode
  activeTool: EditorTool
  activeCellType: CellType

  // Project
  newProject: (name: string) => void
  setProject: (project: MapProject) => void

  // Navigation
  setActiveLevel: (levelId: string) => void
  setViewMode: (mode: ViewMode) => void

  // Tool selection
  setActiveTool: (tool: EditorTool) => void
  setActiveCellType: (type: CellType) => void

  // Cell editing
  paintCell: (x: number, y: number) => void
  eraseCell: (x: number, y: number) => void

  // Level management
  addDungeonLevel: () => void
  removeDungeonLevel: (levelId: string) => void
}

export const useMapStore = create<MapStore>((set, get) => ({
  project: null,
  isDirty: false,
  activeLevelId: null,
  viewMode: 'topdown',
  activeTool: 'paint',
  activeCellType: 'floor',

  newProject: (name) => {
    const project = createNewProject(name)
    set({ project, isDirty: false, activeLevelId: project.overworld.id })
  },

  setProject: (project) => {
    set({ project, isDirty: false, activeLevelId: project.overworld.id })
  },

  setActiveLevel: (activeLevelId) => set({ activeLevelId }),
  setViewMode: (viewMode) => set({ viewMode }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setActiveCellType: (activeCellType) => set({ activeCellType }),

  paintCell: (x, y) => {
    const { project, activeLevelId, activeCellType } = get()
    if (!project || !activeLevelId) return

    const applyToLevel = (level: Level): Level => {
      if (level.id !== activeLevelId) return level
      if (x < 0 || y < 0 || x >= level.grid.width || y >= level.grid.height) return level
      const newCells = level.grid.cells.map((row, ry) =>
        row.map((cell, rx) =>
          rx === x && ry === y ? { ...cell, type: activeCellType } : cell
        )
      )
      return { ...level, grid: { ...level.grid, cells: newCells } }
    }

    set({
      project: {
        ...project,
        updatedAt: new Date().toISOString(),
        overworld: applyToLevel(project.overworld),
        dungeonLevels: project.dungeonLevels.map(applyToLevel)
      },
      isDirty: true
    })
  },

  eraseCell: (x, y) => {
    const { project, activeLevelId } = get()
    if (!project || !activeLevelId) return

    const applyToLevel = (level: Level): Level => {
      if (level.id !== activeLevelId) return level
      if (x < 0 || y < 0 || x >= level.grid.width || y >= level.grid.height) return level
      const newCells = level.grid.cells.map((row, ry) =>
        row.map((cell, rx) =>
          rx === x && ry === y ? { ...cell, type: 'empty' as CellType } : cell
        )
      )
      return { ...level, grid: { ...level.grid, cells: newCells } }
    }

    set({
      project: {
        ...project,
        updatedAt: new Date().toISOString(),
        overworld: applyToLevel(project.overworld),
        dungeonLevels: project.dungeonLevels.map(applyToLevel)
      },
      isDirty: true
    })
  },

  addDungeonLevel: () => {
    const { project } = get()
    if (!project) return
    const depth = project.dungeonLevels.length + 1
    const newLevel = createNewLevel(`Level ${depth}`, depth)
    set({
      project: { ...project, dungeonLevels: [...project.dungeonLevels, newLevel] },
      activeLevelId: newLevel.id,
      isDirty: true
    })
  },

  removeDungeonLevel: (levelId) => {
    const { project, activeLevelId } = get()
    if (!project) return
    const remaining = project.dungeonLevels.filter((l) => l.id !== levelId)
    set({
      project: { ...project, dungeonLevels: remaining },
      activeLevelId: activeLevelId === levelId ? project.overworld.id : activeLevelId,
      isDirty: true
    })
  }
}))
