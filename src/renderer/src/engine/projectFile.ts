import JSZip from 'jszip'
import { MapProject, ObjectDefinition, TokenDefinition, PropDefinition, FloorTextureDefinition } from '../types/map'

/** Renamed/removed floor material IDs → replacement IDs */
const FLOOR_MATERIAL_MIGRATIONS: Record<string, string> = {
  dirt: 'ground',
  pit:  'stone'
}

/** Remove runtime-only fields that are resolved at load time */
function stripDef(def: ObjectDefinition): ObjectDefinition {
  if (def.kind === 'token') {
    const d = def as TokenDefinition
    return { ...d, visual: { ...d.visual, iconContent: '' } }
  } else {
    const d = def as PropDefinition
    return { ...d, visual: { ...d.visual, textureUrl: '' } }
  }
}

function stripFloorTextureDef(def: FloorTextureDefinition): FloorTextureDefinition {
  return { ...def, textureUrl: '' }
}

function stripRuntimeFields(project: MapProject): MapProject {
  return {
    ...project,
    updatedAt:            new Date().toISOString(),
    projectCatalog:       project.projectCatalog.map(stripDef),
    projectFloorTextures: project.projectFloorTextures.map(stripFloorTextureDef)
  }
}

export async function buildCrwlBuffer(project: MapProject): Promise<ArrayBuffer> {
  const zip   = new JSZip()
  const clean = stripRuntimeFields(project)

  // Store project-tier floor texture binaries as separate zip entries
  for (const def of project.projectFloorTextures) {
    if (!def.textureUrl || !def.texture) continue
    try {
      const resp = await fetch(def.textureUrl)
      const blob = await resp.blob()
      const buf  = await blob.arrayBuffer()
      zip.file(`textures/floor/${def.texture}`, buf)
    } catch (e) {
      console.warn('[crwl] failed to embed floor texture:', def.texture, e)
    }
  }

  zip.file('project.json', JSON.stringify(clean, null, 2))
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}

function migrateFloorMaterial(id: string): string {
  return FLOOR_MATERIAL_MIGRATIONS[id] ?? id
}

function migrateLevel(level: MapProject['overworld']): MapProject['overworld'] {
  const settings = {
    ...level.settings,
    floorMaterial: migrateFloorMaterial(level.settings.floorMaterial)
  }
  return {
    ...level,
    settings,
    rooms: level.rooms.map((r) => ({
      label:       '',
      showLabel:   false,
      labelOffset: { x: 0, y: 0 },
      notes:       '',
      ...r,
      settings: {
        ...r.settings,
        ...(r.settings.floorMaterial
          ? { floorMaterial: migrateFloorMaterial(r.settings.floorMaterial) }
          : {})
      }
    })),
    hallways: level.hallways.map((h) => ({
      ...h,
      settings: {
        ...h.settings,
        ...(h.settings.floorMaterial
          ? { floorMaterial: migrateFloorMaterial(h.settings.floorMaterial) }
          : {})
      }
    }))
  }
}

function migrateProject(project: MapProject): MapProject {
  return {
    players:              [],
    projectFloorTextures: [],
    ...project,
    overworld:     migrateLevel(project.overworld),
    dungeonLevels: project.dungeonLevels.map(migrateLevel)
  }
}

export async function parseCrwlBuffer(data: ArrayBuffer): Promise<MapProject> {
  const zip      = await JSZip.loadAsync(data)
  const jsonFile = zip.file('project.json')
  if (!jsonFile) throw new Error('Invalid .crwl file: missing project.json')
  const json    = await jsonFile.async('string')
  const project = migrateProject(JSON.parse(json) as MapProject)

  // Resolve project-tier floor texture binaries into blob URLs
  for (const def of project.projectFloorTextures) {
    if (!def.texture) continue
    const entry = zip.file(`textures/floor/${def.texture}`)
    if (!entry) continue
    try {
      const buf  = await entry.async('arraybuffer')
      const ext  = def.texture.split('.').pop()?.toLowerCase() ?? 'png'
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
      const blob = new Blob([buf], { type: mime })
      def.textureUrl = URL.createObjectURL(blob)
    } catch (e) {
      console.warn('[crwl] failed to extract floor texture:', def.texture, e)
    }
  }

  return project
}
