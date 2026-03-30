// ── Material types ─────────────────────────────────────────────────────────────

export type FloorMaterial = 'stone' | 'wood' | 'dirt' | 'water' | 'lava' | 'pit'
export type WallMaterial  = 'stone' | 'wood' | 'brick' | 'cave'

// ── Cascade settings (Level → Room → Hallway → Cell) ──────────────────────────

export interface SurfaceSettings {
  floorMaterial: FloorMaterial
  wallMaterial:  WallMaterial
  ceilingHeight: number       // 1–4 grid units
  wallThickness: 1 | 2 | 3   // cells
  lightLevel:    'bright' | 'dim' | 'dark'
}

export const DEFAULT_SETTINGS: SurfaceSettings = {
  floorMaterial: 'stone',
  wallMaterial:  'stone',
  ceilingHeight: 2,
  wallThickness: 1,
  lightLevel:    'dim'
}

// ── Cell-level overrides (decoration / special features) ──────────────────────

export type CellFeature =
  | 'stairs_up'
  | 'stairs_down'
  | 'pillar'
  | 'rubble'
  | 'door'
  | 'secret_door'

export interface CellOverride {
  floorMaterial?: FloorMaterial
  feature?:       CellFeature
}

// ── Room ───────────────────────────────────────────────────────────────────────

export interface Room {
  id:          string
  name:        string
  description: string
  /** Grid column of the top-left corner */
  x:           number
  /** Grid row of the top-left corner */
  y:           number
  width:       number  // ≥ 2
  height:      number  // ≥ 2
  /** Partial overrides; missing keys inherit from Level settings */
  settings:    Partial<SurfaceSettings>
  /** Sparse per-cell decoration overrides; key format: "col,row" */
  cellOverrides: Record<string, CellOverride>
}

// ── Hallway ────────────────────────────────────────────────────────────────────

export interface Waypoint {
  x: number
  y: number
}

export interface Hallway {
  id:        string
  roomAId:   string
  roomBId:   string
  /** User-placed intermediate waypoints; path is computed from these + exit points */
  waypoints: Waypoint[]
  /** Pinned exit cell on room A's wall (just outside). Auto-computed when absent. */
  exitA?:    { x: number; y: number }
  /** Pinned exit cell on room B's wall (just outside). Auto-computed when absent. */
  exitB?:    { x: number; y: number }
  width:     1 | 2 | 3 | 4 | 5
  settings:  Partial<SurfaceSettings>
}

// ── Level ──────────────────────────────────────────────────────────────────────

export interface LevelSettings extends SurfaceSettings {
  gridWidth:  number
  gridHeight: number
}

export interface Level {
  id:         string
  name:       string
  /** 0 = overworld, 1+ = dungeon floors */
  depth:      number
  settings:   LevelSettings
  rooms:      Room[]
  hallways:   Hallway[]
  placements: Placement[]
}

// ── Catalog / Placements ───────────────────────────────────────────────────────

export interface ItemDefinition {
  id:          string
  name:        string
  description: string
  category:    string
  properties:  Record<string, unknown>
}

export interface EntityDefinition {
  id:          string
  name:        string
  description: string
  type:        'monster' | 'npc' | 'boss' | 'neutral'
  cr?:         number
  properties:  Record<string, unknown>
}

export interface Catalog {
  items:    ItemDefinition[]
  entities: EntityDefinition[]
}

export interface Placement {
  id:          string
  catalogId:   string
  catalogType: 'item' | 'entity'
  x:           number
  y:           number
  quantity?:   number
  metadata:    Record<string, unknown>
}

// ── Project ────────────────────────────────────────────────────────────────────

export interface MapMetadata {
  description?: string
  author?:      string
  system?:      string
  tags?:        string[]
  [key: string]: unknown
}

export interface MapProject {
  id:            string
  name:          string
  version:       string
  createdAt:     string
  updatedAt:     string
  metadata:      MapMetadata
  catalog:       Catalog
  overworld:     Level
  dungeonLevels: Level[]
}
