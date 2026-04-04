import { MapProject, Player } from '../../types/map'
import { Command } from '../../types/commands'

// ── Add player ─────────────────────────────────────────────────────────────────

export class AddPlayerCommand implements Command {
  constructor(private readonly player: Player) {}

  execute(project: MapProject): MapProject {
    return { ...project, players: [...project.players, this.player] }
  }

  undo(project: MapProject): MapProject {
    return { ...project, players: project.players.filter((p) => p.id !== this.player.id) }
  }
}

// ── Remove player ──────────────────────────────────────────────────────────────

export class RemovePlayerCommand implements Command {
  private snapshot: Player | null = null

  constructor(private readonly playerId: string) {}

  execute(project: MapProject): MapProject {
    const player = project.players.find((p) => p.id === this.playerId)
    if (!player) return project
    this.snapshot = player
    return { ...project, players: project.players.filter((p) => p.id !== this.playerId) }
  }

  undo(project: MapProject): MapProject {
    if (!this.snapshot) return project
    return { ...project, players: [...project.players, this.snapshot] }
  }
}

// ── Update player (name / notes / portrait) ────────────────────────────────────

export class UpdatePlayerCommand implements Command {
  private before: Pick<Player, 'name' | 'notes' | 'portrait'> | null = null

  constructor(
    private readonly playerId: string,
    private readonly after: Pick<Player, 'name' | 'notes' | 'portrait'>
  ) {}

  execute(project: MapProject): MapProject {
    return {
      ...project,
      players: project.players.map((p) => {
        if (p.id !== this.playerId) return p
        this.before = { name: p.name, notes: p.notes, portrait: p.portrait }
        return { ...p, ...this.after }
      })
    }
  }

  undo(project: MapProject): MapProject {
    if (!this.before) return project
    const before = this.before
    return {
      ...project,
      players: project.players.map((p) =>
        p.id === this.playerId ? { ...p, ...before } : p
      )
    }
  }
}

// ── Update player placement ────────────────────────────────────────────────────

export class UpdatePlayerPlacementCommand implements Command {
  private before: Player['placement'] = null

  constructor(
    private readonly playerId: string,
    private readonly placement: Player['placement']
  ) {}

  execute(project: MapProject): MapProject {
    return {
      ...project,
      players: project.players.map((p) => {
        if (p.id !== this.playerId) return p
        this.before = p.placement
        return { ...p, placement: this.placement }
      })
    }
  }

  undo(project: MapProject): MapProject {
    const before = this.before
    return {
      ...project,
      players: project.players.map((p) =>
        p.id === this.playerId ? { ...p, placement: before } : p
      )
    }
  }
}
