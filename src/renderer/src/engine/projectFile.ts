import JSZip from 'jszip'
import { MapProject, ObjectDefinition, TokenDefinition, PropDefinition } from '../types/map'

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

function stripRuntimeFields(project: MapProject): MapProject {
  return {
    ...project,
    updatedAt:      new Date().toISOString(),
    projectCatalog: project.projectCatalog.map(stripDef)
  }
}

export async function buildCrwlBuffer(project: MapProject): Promise<ArrayBuffer> {
  const zip   = new JSZip()
  const clean = stripRuntimeFields(project)
  zip.file('project.json', JSON.stringify(clean, null, 2))
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}

function migrateProject(project: MapProject): MapProject {
  const migrateLevel = (level: MapProject['overworld']) => ({
    ...level,
    rooms: level.rooms.map((r) => ({
      label:       '',
      showLabel:   false,
      labelOffset: { x: 0, y: 0 },
      notes:       '',
      ...r
    }))
  })
  return {
    players: [],   // default for old saves without players
    ...project,
    overworld:     migrateLevel(project.overworld),
    dungeonLevels: project.dungeonLevels.map(migrateLevel)
  }
}

export async function parseCrwlBuffer(data: ArrayBuffer): Promise<MapProject> {
  const zip      = await JSZip.loadAsync(data)
  const jsonFile = zip.file('project.json')
  if (!jsonFile) throw new Error('Invalid .crwl file: missing project.json')
  const json = await jsonFile.async('string')
  return migrateProject(JSON.parse(json) as MapProject)
}
