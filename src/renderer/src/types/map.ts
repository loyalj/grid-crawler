export type CellType =
  | 'empty'
  | 'floor'
  | 'wall'
  | 'door'
  | 'secret_door'
  | 'stairs_up'
  | 'stairs_down'
  | 'water'
  | 'lava'
  | 'pit'
  | 'rubble'
  | 'pillar'

export interface Cell {
  type: CellType
  metadata?: Record<string, unknown>
}

// cells[row][col] — row = y, col = x
export interface Grid {
  width: number
  height: number
  cells: Cell[][]
}

export interface Room {
  id: string
  name: string
  description: string
  cells: Array<{ x: number; y: number }>
  metadata: Record<string, unknown>
}

export interface Hallway {
  id: string
  name?: string
  cells: Array<{ x: number; y: number }>
  metadata: Record<string, unknown>
}

export interface ItemDefinition {
  id: string
  name: string
  description: string
  category: string
  properties: Record<string, unknown>
}

export interface EntityDefinition {
  id: string
  name: string
  description: string
  type: 'monster' | 'npc' | 'boss' | 'neutral'
  cr?: number
  properties: Record<string, unknown>
}

export interface Catalog {
  items: ItemDefinition[]
  entities: EntityDefinition[]
}

export interface Placement {
  id: string
  catalogId: string
  catalogType: 'item' | 'entity'
  x: number
  y: number
  quantity?: number
  metadata: Record<string, unknown>
}

export interface LevelMetadata {
  description?: string
  ambiance?: string
  lightLevel?: 'bright' | 'dim' | 'dark'
  temperature?: 'frigid' | 'cold' | 'temperate' | 'warm' | 'hot'
  [key: string]: unknown
}

export interface Level {
  id: string
  name: string
  depth: number  // 0 = overworld, 1+ = dungeon levels
  metadata: LevelMetadata
  grid: Grid
  rooms: Room[]
  hallways: Hallway[]
  placements: Placement[]
}

export interface MapMetadata {
  description?: string
  author?: string
  system?: string  // e.g. "D&D 5e", "Pathfinder 2e"
  tags?: string[]
  [key: string]: unknown
}

export interface MapProject {
  id: string
  name: string
  version: string
  createdAt: string
  updatedAt: string
  metadata: MapMetadata
  catalog: Catalog
  overworld: Level
  dungeonLevels: Level[]
}
