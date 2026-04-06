import { ObjectDefinition } from '../types/map'

export interface CatalogSnapshot {
  appTokenCategories:     string[]
  appPropCategories:      string[]
  appObjects:             ObjectDefinition[]
  projectTokenCategories: string[]
  projectPropCategories:  string[]
  projectObjects:         ObjectDefinition[]
  projectOpen:            boolean
}

export function emptySnapshot(): CatalogSnapshot {
  return {
    appTokenCategories:     [],
    appPropCategories:      [],
    appObjects:             [],
    projectTokenCategories: [],
    projectPropCategories:  [],
    projectObjects:         [],
    projectOpen:            false
  }
}

export type TierFilter = 'all' | 'app' | 'project'
