import { Command } from '../../types/commands'
import { MapProject, Room, Hallway } from '../../types/map'

// ── Shared helpers ─────────────────────────────────────────────────────────────

function withUpdatedAt(project: MapProject): MapProject {
  return { ...project, updatedAt: new Date().toISOString() }
}

function mapRooms(
  project: MapProject,
  levelId: string,
  updater: (rooms: Room[]) => Room[]
): MapProject {
  const applyToLevel = (level: { id: string; rooms: Room[] }) =>
    level.id === levelId ? { ...level, rooms: updater(level.rooms) } : level

  return withUpdatedAt({
    ...project,
    overworld:     applyToLevel(project.overworld) as typeof project.overworld,
    dungeonLevels: project.dungeonLevels.map(applyToLevel) as typeof project.dungeonLevels
  })
}

function shiftPoint(
  pt: { x: number; y: number } | undefined,
  dx: number, dy: number
): { x: number; y: number } | undefined {
  if (!pt) return undefined
  return { x: pt.x + dx, y: pt.y + dy }
}

function shiftHallwayExits(
  project: MapProject,
  levelId: string,
  roomId:  string,
  dx: number,
  dy: number
): MapProject {
  const applyToLevel = (level: { id: string; hallways: Hallway[] }) => {
    if (level.id !== levelId) return level
    return {
      ...level,
      hallways: level.hallways.map((h) => {
        const newExitA = h.roomAId === roomId ? shiftPoint(h.exitA, dx, dy) : h.exitA
        const newExitB = h.roomBId === roomId ? shiftPoint(h.exitB, dx, dy) : h.exitB
        if (newExitA === h.exitA && newExitB === h.exitB) return h
        return { ...h, exitA: newExitA, exitB: newExitB }
      })
    }
  }

  return {
    ...project,
    overworld:     applyToLevel(project.overworld) as typeof project.overworld,
    dungeonLevels: project.dungeonLevels.map(applyToLevel) as typeof project.dungeonLevels
  }
}

// ── Commands ───────────────────────────────────────────────────────────────────

export class AddRoomCommand implements Command {
  readonly description = 'Add room'

  constructor(
    private readonly levelId: string,
    private readonly room:    Room
  ) {}

  execute(project: MapProject): MapProject {
    return mapRooms(project, this.levelId, (rooms) => [...rooms, this.room])
  }

  undo(project: MapProject): MapProject {
    return mapRooms(project, this.levelId, (rooms) =>
      rooms.filter((r) => r.id !== this.room.id)
    )
  }
}

export class RemoveRoomCommand implements Command {
  readonly description = 'Remove room'

  constructor(
    private readonly levelId: string,
    private readonly room:    Room
  ) {}

  execute(project: MapProject): MapProject {
    return mapRooms(project, this.levelId, (rooms) =>
      rooms.filter((r) => r.id !== this.room.id)
    )
  }

  undo(project: MapProject): MapProject {
    return mapRooms(project, this.levelId, (rooms) => [...rooms, this.room])
  }
}

export class MoveRoomCommand implements Command {
  readonly description = 'Move room'

  constructor(
    private readonly levelId: string,
    private readonly roomId:  string,
    private readonly from:    { x: number; y: number },
    private readonly to:      { x: number; y: number }
  ) {}

  execute(project: MapProject): MapProject {
    const dx = this.to.x - this.from.x
    const dy = this.to.y - this.from.y
    const p1 = mapRooms(project, this.levelId, (rooms) =>
      rooms.map((r) => r.id === this.roomId ? { ...r, x: this.to.x, y: this.to.y } : r)
    )
    return shiftHallwayExits(p1, this.levelId, this.roomId, dx, dy)
  }

  undo(project: MapProject): MapProject {
    const dx = this.from.x - this.to.x
    const dy = this.from.y - this.to.y
    const p1 = mapRooms(project, this.levelId, (rooms) =>
      rooms.map((r) => r.id === this.roomId ? { ...r, x: this.from.x, y: this.from.y } : r)
    )
    return shiftHallwayExits(p1, this.levelId, this.roomId, dx, dy)
  }
}

export class ResizeRoomCommand implements Command {
  readonly description = 'Resize room'

  constructor(
    private readonly levelId: string,
    private readonly roomId:  string,
    private readonly from:    { x: number; y: number; width: number; height: number },
    private readonly to:      { x: number; y: number; width: number; height: number }
  ) {}

  execute(project: MapProject): MapProject {
    return mapRooms(project, this.levelId, (rooms) =>
      rooms.map((r) => (r.id === this.roomId ? { ...r, ...this.to } : r))
    )
  }

  undo(project: MapProject): MapProject {
    return mapRooms(project, this.levelId, (rooms) =>
      rooms.map((r) => (r.id === this.roomId ? { ...r, ...this.from } : r))
    )
  }
}

export class UpdateRoomCommand implements Command {
  readonly description = 'Update room'

  constructor(
    private readonly levelId: string,
    private readonly before:  Room,
    private readonly after:   Room
  ) {}

  execute(project: MapProject): MapProject {
    return mapRooms(project, this.levelId, (rooms) =>
      rooms.map((r) => (r.id === this.after.id ? this.after : r))
    )
  }

  undo(project: MapProject): MapProject {
    return mapRooms(project, this.levelId, (rooms) =>
      rooms.map((r) => (r.id === this.before.id ? this.before : r))
    )
  }
}
