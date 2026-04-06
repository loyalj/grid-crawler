import { Command } from '../../types/commands'
import { MapProject, Level, Room, Hallway, ObjectPlacement } from '../../types/map'

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

export class GenerateLevelCommand implements Command {
  readonly description = 'Generate level'

  constructor(
    private readonly levelId: string,
    private readonly before: { rooms: Room[]; hallways: Hallway[]; placements: ObjectPlacement[] },
    private readonly after:  { rooms: Room[]; hallways: Hallway[] }
  ) {}

  private applyToLevel(
    project: MapProject,
    rooms: Room[],
    hallways: Hallway[],
    placements: ObjectPlacement[]
  ): MapProject {
    const patch = (level: Level): Level => ({
      ...level,
      rooms,
      hallways,
      placements
    })
    if (project.overworld.id === this.levelId) {
      return { ...project, updatedAt: new Date().toISOString(), overworld: patch(project.overworld) }
    }
    return {
      ...project,
      updatedAt: new Date().toISOString(),
      dungeonLevels: project.dungeonLevels.map((l) =>
        l.id === this.levelId ? patch(l) : l
      )
    }
  }

  execute(project: MapProject): MapProject {
    return this.applyToLevel(project, this.after.rooms, this.after.hallways, [])
  }

  undo(project: MapProject): MapProject {
    return this.applyToLevel(
      project,
      this.before.rooms,
      this.before.hallways,
      this.before.placements
    )
  }
}
