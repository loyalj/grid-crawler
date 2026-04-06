import { TextureDefinition } from '../types/map'

export interface TextureCatalogSnapshot {
  appTextures:     TextureDefinition[]
  projectTextures: TextureDefinition[]
  projectOpen:     boolean
}

export function emptySnapshot(): TextureCatalogSnapshot {
  return {
    appTextures:     [],
    projectTextures: [],
    projectOpen:     false
  }
}

export type TierFilter = 'all' | 'app' | 'project'
