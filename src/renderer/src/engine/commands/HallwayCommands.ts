import { Command } from '../../types/commands'
import { MapProject, Hallway, Waypoint } from '../../types/map'

// ── Shared helpers ─────────────────────────────────────────────────────────────

function withUpdatedAt(project: MapProject): MapProject {
  return { ...project, updatedAt: new Date().toISOString() }
}

function mapHallways(
  project: MapProject,
  levelId: string,
  updater: (hallways: Hallway[]) => Hallway[]
): MapProject {
  const applyToLevel = (level: { id: string; hallways: Hallway[] }) =>
    level.id === levelId ? { ...level, hallways: updater(level.hallways) } : level

  return withUpdatedAt({
    ...project,
    overworld:     applyToLevel(project.overworld) as typeof project.overworld,
    dungeonLevels: project.dungeonLevels.map(applyToLevel) as typeof project.dungeonLevels
  })
}

// ── Commands ───────────────────────────────────────────────────────────────────

export class AddHallwayCommand implements Command {
  readonly description = 'Add hallway'

  constructor(
    private readonly levelId:  string,
    private readonly hallway:  Hallway
  ) {}

  execute(project: MapProject): MapProject {
    return mapHallways(project, this.levelId, (hallways) => [...hallways, this.hallway])
  }

  undo(project: MapProject): MapProject {
    return mapHallways(project, this.levelId, (hallways) =>
      hallways.filter((h) => h.id !== this.hallway.id)
    )
  }
}

export class RemoveHallwayCommand implements Command {
  readonly description = 'Remove hallway'

  constructor(
    private readonly levelId:  string,
    private readonly hallway:  Hallway
  ) {}

  execute(project: MapProject): MapProject {
    return mapHallways(project, this.levelId, (hallways) =>
      hallways.filter((h) => h.id !== this.hallway.id)
    )
  }

  undo(project: MapProject): MapProject {
    return mapHallways(project, this.levelId, (hallways) => [...hallways, this.hallway])
  }
}

export class UpdateHallwayWaypointsCommand implements Command {
  readonly description = 'Update hallway'

  constructor(
    private readonly levelId:    string,
    private readonly hallwayId:  string,
    private readonly from:       Waypoint[],
    private readonly to:         Waypoint[]
  ) {}

  execute(project: MapProject): MapProject {
    return mapHallways(project, this.levelId, (hallways) =>
      hallways.map((h) =>
        h.id === this.hallwayId ? { ...h, waypoints: this.to } : h
      )
    )
  }

  undo(project: MapProject): MapProject {
    return mapHallways(project, this.levelId, (hallways) =>
      hallways.map((h) =>
        h.id === this.hallwayId ? { ...h, waypoints: this.from } : h
      )
    )
  }
}

export class UpdateHallwayCommand implements Command {
  readonly description = 'Update hallway'

  constructor(
    private readonly levelId: string,
    private readonly before:  Hallway,
    private readonly after:   Hallway
  ) {}

  execute(project: MapProject): MapProject {
    return mapHallways(project, this.levelId, (hallways) =>
      hallways.map((h) => (h.id === this.after.id ? this.after : h))
    )
  }

  undo(project: MapProject): MapProject {
    return mapHallways(project, this.levelId, (hallways) =>
      hallways.map((h) => (h.id === this.before.id ? this.before : h))
    )
  }
}

export class UpdateHallwayExitsCommand implements Command {
  readonly description = 'Move hallway endpoint'

  constructor(
    private readonly levelId:    string,
    private readonly hallwayId:  string,
    private readonly from: { exitA?: { x: number; y: number }; exitB?: { x: number; y: number } },
    private readonly to:   { exitA?: { x: number; y: number }; exitB?: { x: number; y: number } }
  ) {}

  execute(project: MapProject): MapProject {
    return mapHallways(project, this.levelId, (hallways) =>
      hallways.map((h) => h.id === this.hallwayId ? { ...h, ...this.to } : h)
    )
  }

  undo(project: MapProject): MapProject {
    return mapHallways(project, this.levelId, (hallways) =>
      hallways.map((h) => h.id === this.hallwayId ? { ...h, ...this.from } : h)
    )
  }
}
