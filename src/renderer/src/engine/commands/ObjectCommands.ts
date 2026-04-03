import { Command } from '../../types/commands'
import { MapProject, ObjectPlacement, PropPlacement } from '../../types/map'

// ── Shared helper ─────────────────────────────────────────────────────────────

function withUpdatedAt(project: MapProject): MapProject {
  return { ...project, updatedAt: new Date().toISOString() }
}

function mapPlacements(
  project: MapProject,
  levelId: string,
  updater: (placements: ObjectPlacement[]) => ObjectPlacement[]
): MapProject {
  const applyToLevel = (level: { id: string; placements: ObjectPlacement[] }) =>
    level.id === levelId ? { ...level, placements: updater(level.placements) } : level

  return withUpdatedAt({
    ...project,
    overworld:     applyToLevel(project.overworld) as typeof project.overworld,
    dungeonLevels: project.dungeonLevels.map(applyToLevel) as typeof project.dungeonLevels
  })
}

// ── Commands ───────────────────────────────────────────────────────────────────

export class PlaceObjectCommand implements Command {
  readonly description = 'Place object'

  constructor(
    private readonly levelId:   string,
    private readonly placement: ObjectPlacement
  ) {}

  execute(project: MapProject): MapProject {
    return mapPlacements(project, this.levelId, (ps) => [...ps, this.placement])
  }

  undo(project: MapProject): MapProject {
    return mapPlacements(project, this.levelId, (ps) =>
      ps.filter((p) => p.id !== this.placement.id)
    )
  }
}

export class RemoveObjectCommand implements Command {
  readonly description = 'Remove object'

  constructor(
    private readonly levelId:   string,
    private readonly placement: ObjectPlacement
  ) {}

  execute(project: MapProject): MapProject {
    return mapPlacements(project, this.levelId, (ps) =>
      ps.filter((p) => p.id !== this.placement.id)
    )
  }

  undo(project: MapProject): MapProject {
    return mapPlacements(project, this.levelId, (ps) => [...ps, this.placement])
  }
}

export class MoveObjectCommand implements Command {
  readonly description = 'Move object'

  constructor(
    private readonly levelId:     string,
    private readonly placementId: string,
    private readonly from: { x: number; y: number },
    private readonly to:   { x: number; y: number }
  ) {}

  execute(project: MapProject): MapProject {
    return mapPlacements(project, this.levelId, (ps) =>
      ps.map((p) => p.id === this.placementId ? { ...p, x: this.to.x, y: this.to.y } : p)
    )
  }

  undo(project: MapProject): MapProject {
    return mapPlacements(project, this.levelId, (ps) =>
      ps.map((p) => p.id === this.placementId ? { ...p, x: this.from.x, y: this.from.y } : p)
    )
  }
}

export class RotatePropCommand implements Command {
  readonly description = 'Rotate prop'

  constructor(
    private readonly levelId:     string,
    private readonly placementId: string,
    private readonly from: PropPlacement['rotation'],
    private readonly to:   PropPlacement['rotation']
  ) {}

  execute(project: MapProject): MapProject {
    return mapPlacements(project, this.levelId, (ps) =>
      ps.map((p) =>
        p.id === this.placementId && p.kind === 'prop'
          ? { ...p, rotation: this.to }
          : p
      )
    )
  }

  undo(project: MapProject): MapProject {
    return mapPlacements(project, this.levelId, (ps) =>
      ps.map((p) =>
        p.id === this.placementId && p.kind === 'prop'
          ? { ...p, rotation: this.from }
          : p
      )
    )
  }
}

export class UpdateObjectPropertiesCommand implements Command {
  readonly description = 'Update object properties'

  constructor(
    private readonly levelId:     string,
    private readonly placementId: string,
    private readonly before: Record<string, string>,
    private readonly after:  Record<string, string>
  ) {}

  execute(project: MapProject): MapProject {
    return mapPlacements(project, this.levelId, (ps) =>
      ps.map((p) => p.id === this.placementId ? { ...p, propertyValues: this.after } : p)
    )
  }

  undo(project: MapProject): MapProject {
    return mapPlacements(project, this.levelId, (ps) =>
      ps.map((p) => p.id === this.placementId ? { ...p, propertyValues: this.before } : p)
    )
  }
}
