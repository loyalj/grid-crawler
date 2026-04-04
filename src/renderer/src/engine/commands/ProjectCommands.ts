import { Command } from '../../types/commands'
import { MapProject, MapMetadata } from '../../types/map'

interface ProjectSnapshot {
  name:     string
  version:  string
  metadata: MapMetadata
}

export class UpdateProjectMetadataCommand implements Command {
  readonly description = 'Update project info'

  constructor(
    private readonly before: ProjectSnapshot,
    private readonly after:  ProjectSnapshot
  ) {}

  execute(project: MapProject): MapProject {
    return { ...project, ...this.after, updatedAt: new Date().toISOString() }
  }

  undo(project: MapProject): MapProject {
    return { ...project, ...this.before, updatedAt: new Date().toISOString() }
  }
}
