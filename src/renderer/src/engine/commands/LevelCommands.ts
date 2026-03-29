import { Command } from '../../types/commands'
import { MapProject, Level } from '../../types/map'

export class AddLevelCommand implements Command {
  readonly description = 'Add dungeon level'

  constructor(private readonly level: Level) {}

  execute(project: MapProject): MapProject {
    return {
      ...project,
      updatedAt:     new Date().toISOString(),
      dungeonLevels: [...project.dungeonLevels, this.level]
    }
  }

  undo(project: MapProject): MapProject {
    return {
      ...project,
      updatedAt:     new Date().toISOString(),
      dungeonLevels: project.dungeonLevels.filter((l) => l.id !== this.level.id)
    }
  }
}

export class RemoveLevelCommand implements Command {
  readonly description = 'Remove dungeon level'

  constructor(
    private readonly level: Level,
    private readonly index: number
  ) {}

  execute(project: MapProject): MapProject {
    return {
      ...project,
      updatedAt:     new Date().toISOString(),
      dungeonLevels: project.dungeonLevels.filter((l) => l.id !== this.level.id)
    }
  }

  undo(project: MapProject): MapProject {
    const levels = [...project.dungeonLevels]
    levels.splice(this.index, 0, this.level)
    return {
      ...project,
      updatedAt:     new Date().toISOString(),
      dungeonLevels: levels
    }
  }
}
