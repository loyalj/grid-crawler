import { Command } from '../../types/commands'
import { MapProject, Room, Hallway, SurfaceSettings } from '../../types/map'
import { nearestWallExit } from '../hallwayPath'

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

/**
 * For any hallway with a pinned exit belonging to `roomId`, re-snaps that exit
 * to the nearest valid wall position on `newRoom`. Unpinned exits are left alone.
 */
function snapHallwayExits(
  project: MapProject,
  levelId: string,
  roomId:  string,
  newRoom: Room
): MapProject {
  const applyToLevel = (level: { id: string; hallways: Hallway[] }) => {
    if (level.id !== levelId) return level
    return {
      ...level,
      hallways: level.hallways.map((h) => {
        const newExitA = h.roomAId === roomId && h.exitA
          ? nearestWallExit(newRoom, h.exitA)
          : h.exitA
        const newExitB = h.roomBId === roomId && h.exitB
          ? nearestWallExit(newRoom, h.exitB)
          : h.exitB
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

export class UpdateRoomSettingsCommand implements Command {
  readonly description = 'Update room settings'

  constructor(
    private readonly levelId: string,
    private readonly roomId:  string,
    private readonly before:  Partial<SurfaceSettings>,
    private readonly after:   Partial<SurfaceSettings>
  ) {}

  execute(project: MapProject): MapProject {
    return mapRooms(project, this.levelId, (rooms) =>
      rooms.map((r) => r.id === this.roomId ? { ...r, settings: this.after } : r)
    )
  }

  undo(project: MapProject): MapProject {
    return mapRooms(project, this.levelId, (rooms) =>
      rooms.map((r) => r.id === this.roomId ? { ...r, settings: this.before } : r)
    )
  }
}

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
  private orphanedHallways: Hallway[] = []

  constructor(
    private readonly levelId: string,
    private readonly room:    Room
  ) {}

  execute(project: MapProject): MapProject {
    const level = project.overworld.id === this.levelId
      ? project.overworld
      : project.dungeonLevels.find((l) => l.id === this.levelId)
    this.orphanedHallways = level
      ? level.hallways.filter((h) => h.roomAId === this.room.id || h.roomBId === this.room.id)
      : []

    const p1 = mapRooms(project, this.levelId, (rooms) =>
      rooms.filter((r) => r.id !== this.room.id)
    )
    return mapHallways(p1, this.levelId, (hallways) =>
      hallways.filter((h) => h.roomAId !== this.room.id && h.roomBId !== this.room.id)
    )
  }

  undo(project: MapProject): MapProject {
    const p1 = mapRooms(project, this.levelId, (rooms) => [...rooms, this.room])
    return mapHallways(p1, this.levelId, (hallways) => [...hallways, ...this.orphanedHallways])
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
    const p1 = mapRooms(project, this.levelId, (rooms) =>
      rooms.map((r) => (r.id === this.roomId ? { ...r, ...this.to } : r))
    )
    const newRoom = { id: this.roomId, ...this.to } as Room
    return snapHallwayExits(p1, this.levelId, this.roomId, newRoom)
  }

  undo(project: MapProject): MapProject {
    const p1 = mapRooms(project, this.levelId, (rooms) =>
      rooms.map((r) => (r.id === this.roomId ? { ...r, ...this.from } : r))
    )
    const oldRoom = { id: this.roomId, ...this.from } as Room
    return snapHallwayExits(p1, this.levelId, this.roomId, oldRoom)
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
