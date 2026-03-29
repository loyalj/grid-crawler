import { Room, Waypoint } from '../types/map'

// ── Helpers ────────────────────────────────────────────────────────────────────

function roomCenter(room: Room): { x: number; y: number } {
  return {
    x: room.x + Math.floor(room.width  / 2),
    y: room.y + Math.floor(room.height / 2)
  }
}

/**
 * Auto-computes the exit cell on the dominant-axis wall of `from`,
 * aimed at `towards`. Returns a cell just outside the room.
 */
function autoExitPoint(from: Room, towards: { x: number; y: number }): { x: number; y: number } {
  const fc = roomCenter(from)
  const dx = towards.x - fc.x
  const dy = towards.y - fc.y

  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx > 0 ? from.x + from.width : from.x - 1, y: fc.y }
  } else {
    return { x: fc.x, y: dy > 0 ? from.y + from.height : from.y - 1 }
  }
}

/**
 * Fills in cells for a single L-shaped segment from `a` to `b`
 * (horizontal leg first, then vertical).
 */
function lSegment(
  a: { x: number; y: number },
  b: { x: number; y: number }
): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = []

  const dx = Math.sign(b.x - a.x)
  if (dx !== 0) {
    for (let x = a.x; x !== b.x; x += dx) cells.push({ x, y: a.y })
  }

  const dy = Math.sign(b.y - a.y)
  if (dy !== 0) {
    for (let y = a.y; y !== b.y + dy; y += dy) cells.push({ x: b.x, y })
  } else {
    cells.push({ x: b.x, y: b.y })
  }

  return cells
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the resolved start and end exit cells for a hallway.
 * Pinned exits take priority; otherwise auto-computed from room geometry.
 */
export function resolveExitPoints(
  roomA:     Room,
  roomB:     Room,
  waypoints: Waypoint[],
  exitA?:    { x: number; y: number },
  exitB?:    { x: number; y: number }
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const target = waypoints[0] ?? roomCenter(roomB)
  const start  = exitA ?? autoExitPoint(roomA, target)
  const endTarget = waypoints[waypoints.length - 1] ?? roomCenter(roomA)
  const end    = exitB ?? autoExitPoint(roomB, endTarget)
  return { start, end }
}

/**
 * Given a cursor position (floating-point grid coords), returns the nearest
 * valid exit cell on the perimeter of `room` (one cell outside the wall).
 */
export function nearestWallExit(
  room:   Room,
  cursor: { x: number; y: number }
): { x: number; y: number } {
  const clampX = (x: number) => Math.max(room.x, Math.min(room.x + room.width  - 1, Math.round(x)))
  const clampY = (y: number) => Math.max(room.y, Math.min(room.y + room.height - 1, Math.round(y)))

  const candidates = [
    { x: room.x + room.width,  y: clampY(cursor.y) }, // right
    { x: room.x - 1,           y: clampY(cursor.y) }, // left
    { x: clampX(cursor.x),     y: room.y + room.height }, // bottom
    { x: clampX(cursor.x),     y: room.y - 1 },       // top
  ]

  let nearest = candidates[0]
  let minDist = Infinity
  for (const c of candidates) {
    const d = (c.x - cursor.x) ** 2 + (c.y - cursor.y) ** 2
    if (d < minDist) { minDist = d; nearest = c }
  }
  return nearest
}

/**
 * Computes the full cell path for a hallway. Respects pinned exit cells
 * (`exitA`/`exitB`) and user-placed waypoints.
 */
export function computePath(
  roomA:     Room,
  roomB:     Room,
  waypoints: Waypoint[],
  exitA?:    { x: number; y: number },
  exitB?:    { x: number; y: number }
): Array<{ x: number; y: number }> {
  const { start, end } = resolveExitPoints(roomA, roomB, waypoints, exitA, exitB)
  const control = [start, ...waypoints, end]
  const all: Array<{ x: number; y: number }> = []

  for (let i = 0; i < control.length - 1; i++) {
    const seg = lSegment(control[i], control[i + 1])
    if (all.length > 0 && seg.length > 0) {
      const last  = all[all.length - 1]
      const first = seg[0]
      if (last.x === first.x && last.y === first.y) {
        all.push(...seg.slice(1))
        continue
      }
    }
    all.push(...seg)
  }

  return all
}
