// ── Floor texture catalog ──────────────────────────────────────────────────────

export type FloorTextureCategory = 'stone' | 'wood' | 'earth' | 'water' | 'special'

export interface FloorTextureDefinition {
  id:          string               // matches FloorMaterial value; 'stone','wood' etc for built-ins
  name:        string
  tier:        'app' | 'project'
  category:    FloorTextureCategory
  layoutColor: number               // hex color used in Layout mode
  texture:     string               // relative path (app) or zip entry path (project)
  textureUrl:  string               // resolved absolute URL at load time; NOT persisted
  tileSize:    number               // grid cells per one texture repeat
}

// ── Material types ─────────────────────────────────────────────────────────────

/** A floor material ID — matches a FloorTextureDefinition.id */
export type FloorMaterial = string
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
  floorMaterial: 'stone',  // matches built-in FloorTextureDefinition id
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
  name:        string          // auto-generated "Room N" identifier
  label:       string          // user-set display name (e.g. "Guard Room"); empty = use name
  showLabel:   boolean         // whether to render the label on the canvas
  labelOffset: { x: number; y: number }  // offset from room center in grid cells
  description: string
  notes:       string
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
  placements: ObjectPlacement[]
}

// ── Object catalog ─────────────────────────────────────────────────────────────

/** A free-form name/value pair the user can attach to any object definition */
export interface ObjectProperty {
  name:         string
  defaultValue: string
}

export type TokenCategory = 'loot' | 'trap' | 'container' | 'hazard'
export type PropCategory  = 'furniture' | 'structure'

export interface TokenVisual {
  /** Relative path in catalog dir — used for editing/display only */
  icon:         string
  /** SVG file content inlined by the main process at load time */
  iconContent:  string
  bgColor:      string
  fgColor:      string
  borderColor:  string
}

export interface PropVisual {
  /** Relative path in catalog dir — used for editing/display only */
  texture:      string
  /** Absolute file:// URL resolved by the main process at load time */
  textureUrl:   string
  /** Width in grid units */
  naturalWidth:  number
  /** Height in grid units */
  naturalHeight: number
}

interface ObjectDefinitionBase {
  id:          string
  name:        string
  description: string
  /** 'app' = shipped with the application; 'project' = stored in the map file */
  tier:        'app' | 'project'
  properties:  ObjectProperty[]
}

export interface TokenDefinition extends ObjectDefinitionBase {
  kind:     'token'
  category: TokenCategory
  visual:   TokenVisual
}

export interface PropDefinition extends ObjectDefinitionBase {
  kind:     'prop'
  category: PropCategory
  visual:   PropVisual
}

export type ObjectDefinition = TokenDefinition | PropDefinition

// ── Object placements (per-level instances) ────────────────────────────────────

interface PlacementBase {
  id:             string
  definitionId:   string
  /** Free-placed float position; top-left origin in grid units */
  x:              number
  y:              number
  /** Per-instance property value overrides; absent keys fall back to definition defaults */
  propertyValues: Record<string, string>
}

export interface TokenPlacement extends PlacementBase {
  kind: 'token'
}

export interface PropPlacement extends PlacementBase {
  kind:     'prop'
  rotation: 0 | 90 | 180 | 270
}

export type ObjectPlacement = TokenPlacement | PropPlacement

// ── Players ────────────────────────────────────────────────────────────────────

export interface Player {
  id:        string
  name:      string
  notes:     string
  /** Base64 PNG data URL (256×256, transparency preserved); null = no portrait */
  portrait:  string | null
  /** At most one active placement across all levels */
  placement: { levelId: string; x: number; y: number } | null
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
  players:       Player[]
  /** Project-tier floor textures; app-tier live in resources/textures/floor/. */
  projectFloorTextures: FloorTextureDefinition[]
  /** Project-tier object definitions only. App-tier live in resources/catalog/. */
  projectCatalog: ObjectDefinition[]
  overworld:     Level
  dungeonLevels: Level[]
}
