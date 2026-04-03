import { create } from 'zustand'
import { MapProject, Level, LevelSettings, DEFAULT_SETTINGS, ObjectDefinition, Room, ObjectPlacement, Hallway } from '../types/map'
import { Command } from '../types/commands'
import { AddLevelCommand, RemoveLevelCommand } from '../engine/commands'

export type ViewMode  = 'topdown' | 'isometric' | 'fps'

export type ClipboardPayload =
  | { kind: 'room';      room: Room; hallways: Hallway[] }
  | { kind: 'placement'; placement: ObjectPlacement }
export type EditorTool = 'room' | 'hallway' | 'select' | 'object'
export type NavSection = 'map' | 'objects' | 'settings'

// ── Helpers ────────────────────────────────────────────────────────────────────

function createLevel(name: string, depth: number, settings: LevelSettings): Level {
  return {
    id:         crypto.randomUUID(),
    name,
    depth,
    settings,
    rooms:      [],
    hallways:   [],
    placements: []
  }
}

function createProject(name: string, width: number, height: number): MapProject {
  const now = new Date().toISOString()
  const settings: LevelSettings = { ...DEFAULT_SETTINGS, gridWidth: width, gridHeight: height }
  return {
    id:             crypto.randomUUID(),
    name,
    version:        '1.0.0',
    createdAt:      now,
    updatedAt:      now,
    metadata:       {},
    projectCatalog: [],
    overworld:      createLevel('Overworld', 0, settings),
    dungeonLevels:  [createLevel('Level 1',  1, settings)]
  }
}

function allLevelIds(project: MapProject): string[] {
  return [project.overworld.id, ...project.dungeonLevels.map((l) => l.id)]
}

// ── Store interface ────────────────────────────────────────────────────────────

interface MapStore {
  // Document
  project:       MapProject | null
  isDirty:       boolean
  activeLevelId: string | null
  undoStack:     Command[]
  redoStack:     Command[]

  // Clipboard (in-app only, not system clipboard)
  clipboard:    ClipboardPayload | null
  setClipboard: (payload: ClipboardPayload | null) => void

  // App catalog (loaded from disk at startup, read-only)
  appCatalog: ObjectDefinition[]
  setAppCatalog: (catalog: ObjectDefinition[]) => void

  // Editor UI (reactive for toolbar etc.)
  viewMode:           ViewMode
  activeTool:         EditorTool
  navSection:         NavSection
  selectedId:         string | null  // selected room, hallway, or placement id
  armedDefinitionId:  string | null  // definition to place when object tool is active
  canUndo:            boolean
  canRedo:            boolean

  // Project lifecycle
  newProject: (name: string, width: number, height: number) => void
  setProject: (project: MapProject) => void

  // Navigation
  setActiveLevel: (levelId: string) => void
  setViewMode:    (mode: ViewMode) => void
  setNavSection:  (section: NavSection) => void

  // Tool + selection
  setActiveTool:        (tool: EditorTool) => void
  setSelected:          (id: string | null) => void
  setArmedDefinition:   (id: string | null) => void

  // Document lifecycle helpers
  markSaved: () => void

  // Command dispatch — the single mutation entry point for content edits
  dispatch: (command: Command) => void
  undo:     () => void
  redo:     () => void

  // Level management (structural; goes through dispatch for undo support)
  addDungeonLevel:    () => void
  removeDungeonLevel: (levelId: string) => void
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useMapStore = create<MapStore>((set, get) => ({
  project:       null,
  isDirty:       false,
  activeLevelId: null,
  undoStack:     [],
  redoStack:     [],

  clipboard:    null,
  setClipboard: (clipboard) => set({ clipboard }),

  appCatalog: [],
  setAppCatalog: (appCatalog) => set({ appCatalog }),

  viewMode:          'topdown',
  activeTool:        'select',
  navSection:        'map' as NavSection,
  selectedId:        null,
  armedDefinitionId: null,
  canUndo:           false,
  canRedo:           false,

  // ── Project lifecycle ────────────────────────────────────────────────────────

  newProject: (name, width, height) => {
    const project = createProject(name, width, height)
    set({
      project,
      isDirty:       false,
      activeLevelId: project.overworld.id,
      undoStack:     [],
      redoStack:     [],
      canUndo:       false,
      canRedo:       false,
      selectedId:    null
    })
  },

  setProject: (project) => {
    set({
      project,
      isDirty:       false,
      activeLevelId: project.overworld.id,
      undoStack:     [],
      redoStack:     [],
      canUndo:       false,
      canRedo:       false,
      selectedId:    null
    })
  },

  // ── Navigation ───────────────────────────────────────────────────────────────

  setActiveLevel: (activeLevelId) => set({ activeLevelId, selectedId: null }),
  setViewMode:    (viewMode) => set({ viewMode }),
  setNavSection:  (navSection) => set(navSection === 'objects'
    ? { navSection, activeTool: 'select', armedDefinitionId: null }
    : { navSection }),

  // ── Tool + selection ─────────────────────────────────────────────────────────

  setActiveTool:      (activeTool) => set((s) => ({
    activeTool,
    selectedId: null,
    // Preserve armedDefinitionId when switching TO object tool; clear it when leaving
    armedDefinitionId: activeTool === 'object' ? s.armedDefinitionId : null
  })),
  setSelected:        (selectedId) => set({ selectedId }),
  setArmedDefinition: (armedDefinitionId) => set({ armedDefinitionId }),

  // ── Document lifecycle helpers ───────────────────────────────────────────────

  markSaved: () => set({ isDirty: false }),

  // ── Command dispatch ─────────────────────────────────────────────────────────

  dispatch: (command) => {
    const { project, undoStack } = get()
    if (!project) return
    const newProject  = command.execute(project)
    const newUndoStack = [...undoStack, command]
    set({
      project:   newProject,
      isDirty:   true,
      undoStack: newUndoStack,
      redoStack: [],
      canUndo:   true,
      canRedo:   false
    })
  },

  undo: () => {
    const { project, undoStack, redoStack } = get()
    if (!project || undoStack.length === 0) return

    const command      = undoStack[undoStack.length - 1]
    const newProject   = command.undo(project)
    const newUndoStack = undoStack.slice(0, -1)
    const newRedoStack = [...redoStack, command]

    // If the active level was removed by this undo, fall back to overworld
    const { activeLevelId } = get()
    const ids = allLevelIds(newProject)
    const nextActiveLevelId = ids.includes(activeLevelId ?? '') ? activeLevelId : newProject.overworld.id

    set({
      project:       newProject,
      isDirty:       true,
      undoStack:     newUndoStack,
      redoStack:     newRedoStack,
      canUndo:       newUndoStack.length > 0,
      canRedo:       true,
      activeLevelId: nextActiveLevelId
    })
  },

  redo: () => {
    const { project, undoStack, redoStack } = get()
    if (!project || redoStack.length === 0) return

    const command      = redoStack[redoStack.length - 1]
    const newProject   = command.execute(project)
    const newUndoStack = [...undoStack, command]
    const newRedoStack = redoStack.slice(0, -1)

    const { activeLevelId } = get()
    const ids = allLevelIds(newProject)
    const nextActiveLevelId = ids.includes(activeLevelId ?? '') ? activeLevelId : newProject.overworld.id

    set({
      project:       newProject,
      isDirty:       true,
      undoStack:     newUndoStack,
      redoStack:     newRedoStack,
      canUndo:       true,
      canRedo:       newRedoStack.length > 0,
      activeLevelId: nextActiveLevelId
    })
  },

  // ── Level management ─────────────────────────────────────────────────────────

  addDungeonLevel: () => {
    const { project, dispatch } = get()
    if (!project) return
    const depth   = project.dungeonLevels.length + 1
    const newLevel = createLevel(`Level ${depth}`, depth, { ...project.overworld.settings })
    dispatch(new AddLevelCommand(newLevel))
    // Set navigation after dispatch so the new level is active
    set({ activeLevelId: newLevel.id })
  },

  removeDungeonLevel: (levelId) => {
    const { project, activeLevelId, dispatch } = get()
    if (!project) return
    const index = project.dungeonLevels.findIndex((l) => l.id === levelId)
    if (index === -1) return
    dispatch(new RemoveLevelCommand(project.dungeonLevels[index], index))
    if (activeLevelId === levelId) set({ activeLevelId: project.overworld.id })
  }
}))
