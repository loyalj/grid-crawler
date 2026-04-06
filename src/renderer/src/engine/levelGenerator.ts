/**
 * Procedural dungeon level generator.
 *
 * Algorithm (based on https://vazgriz.com/119/procedurally-generated-dungeons/):
 *   1. Place rooms randomly inside the grid, resolving overlaps via separation.
 *   2. Delaunay-triangulate the room centres (delaunator).
 *   3. Build a MST (Prim's) over the triangulation edges.
 *   4. Add back a random subset of the remaining triangulation edges (cycles).
 *   5. For each final graph edge, produce a Hallway with an L-shaped waypoint.
 */

import Delaunator from 'delaunator'
import { Room, Hallway, LevelSettings } from '../types/map'

// ── Public API ────────────────────────────────────────────────────────────────

export interface GeneratorParams {
  roomCount:        number   // target number of rooms
  minRoomWidth:     number
  maxRoomWidth:     number
  minRoomHeight:    number
  maxRoomHeight:    number
  extraEdgeChance:  number   // 0–1 probability of re-adding a non-MST triangulation edge
  hallwayWidth:     1 | 3 | 5
}

export const DEFAULT_GENERATOR_PARAMS: GeneratorParams = {
  roomCount:       12,
  minRoomWidth:    3,
  maxRoomWidth:    8,
  minRoomHeight:   3,
  maxRoomHeight:   8,
  extraEdgeChance: 0.125,
  hallwayWidth:    1,
}

export interface GeneratorResult {
  rooms:    Room[]
  hallways: Hallway[]
}

/**
 * Generate a dungeon level that fits inside `settings.gridWidth × settings.gridHeight`.
 * Returns plain Room[] and Hallway[] — the caller is responsible for dispatching
 * them as a command.
 */
export function generateLevel(
  params: GeneratorParams,
  settings: LevelSettings,
  seed?: number
): GeneratorResult {
  const rng = makeRng(seed ?? Date.now())

  // 1. Place rooms ─────────────────────────────────────────────────────────────
  const rooms = placeRooms(params, settings, rng)
  if (rooms.length < 2) return { rooms, hallways: [] }

  // 2. Delaunay triangulation ──────────────────────────────────────────────────
  const delaunay = Delaunator.from(
    rooms.map((r) => [r.x + r.width / 2, r.y + r.height / 2])
  )

  // 3. Collect unique triangulation edges ─────────────────────────────────────
  const triEdges = new Set<string>()
  const edgeList: [number, number][] = []
  const { triangles } = delaunay

  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2]
    for (const [u, v] of [[a, b], [b, c], [a, c]] as [number, number][]) {
      const key = u < v ? `${u}-${v}` : `${v}-${u}`
      if (!triEdges.has(key)) {
        triEdges.add(key)
        edgeList.push([u < v ? u : v, u < v ? v : u])
      }
    }
  }

  // 4. Prim's MST ─────────────────────────────────────────────────────────────
  const cx = (i: number) => rooms[i].x + rooms[i].width  / 2
  const cy = (i: number) => rooms[i].y + rooms[i].height / 2
  const dist = (a: number, b: number) => {
    const dx = cx(a) - cx(b), dy = cy(a) - cy(b)
    return Math.sqrt(dx * dx + dy * dy)
  }

  const inMst   = new Set<number>([0])
  const mstEdges = new Set<string>()

  while (inMst.size < rooms.length) {
    let bestDist = Infinity
    let bestEdge: [number, number] | null = null

    for (const [u, v] of edgeList) {
      const uIn = inMst.has(u), vIn = inMst.has(v)
      if (uIn === vIn) continue          // both in or both out
      const d = dist(u, v)
      if (d < bestDist) { bestDist = d; bestEdge = [u, v] }
    }

    if (!bestEdge) break                 // disconnected graph (shouldn't happen)
    const [u, v] = bestEdge
    inMst.add(u); inMst.add(v)
    mstEdges.add(u < v ? `${u}-${v}` : `${v}-${u}`)
  }

  // 5. Build final edge set: all MST edges + random extras from triangulation ───
  const seen = new Set<string>()
  const dedupedEdges: [number, number][] = []

  for (const [u, v] of edgeList) {
    const key = u < v ? `${u}-${v}` : `${v}-${u}`
    if (seen.has(key)) continue
    if (mstEdges.has(key) || rng() < params.extraEdgeChance) {
      seen.add(key)
      dedupedEdges.push([u, v])
    }
  }

  // 6. Build hallways with L-shaped waypoints ──────────────────────────────────
  const hallways: Hallway[] = dedupedEdges.map(([ai, bi]) => {
    const a = rooms[ai], b = rooms[bi]
    const acx = Math.round(a.x + a.width  / 2)
    const acy = Math.round(a.y + a.height / 2)
    const bcx = Math.round(b.x + b.width  / 2)
    const bcy = Math.round(b.y + b.height / 2)

    // L-bend: go horizontal first, then vertical (or vice-versa based on rng)
    const waypoints = rng() < 0.5
      ? [{ x: bcx, y: acy }]   // horizontal then vertical
      : [{ x: acx, y: bcy }]   // vertical then horizontal

    return {
      id:       crypto.randomUUID(),
      roomAId:  a.id,
      roomBId:  b.id,
      waypoints,
      width:    params.hallwayWidth,
      settings: {}
    }
  })

  return { rooms, hallways }
}

// ── Room placement ────────────────────────────────────────────────────────────

const BUFFER = 1   // minimum cell gap between rooms

function placeRooms(
  params: GeneratorParams,
  settings: LevelSettings,
  rng: () => number
): Room[] {
  const { gridWidth, gridHeight } = settings
  const placed: Room[] = []

  const maxAttempts = params.roomCount * 20

  for (let n = 0; n < params.roomCount; n++) {
    let room: Room | null = null

    for (let attempt = 0; attempt < maxAttempts / params.roomCount; attempt++) {
      const w = randInt(rng, params.minRoomWidth,  params.maxRoomWidth)
      const h = randInt(rng, params.minRoomHeight, params.maxRoomHeight)

      // Leave at least 1-cell margin from grid boundary
      const maxX = gridWidth  - w - 1
      const maxY = gridHeight - h - 1
      if (maxX < 1 || maxY < 1) break

      const x = randInt(rng, 1, maxX)
      const y = randInt(rng, 1, maxY)

      const candidate: Room = makeRoom(x, y, w, h, placed.length)

      if (placed.every((r) => !overlaps(candidate, r, BUFFER))) {
        room = candidate
        break
      }
    }

    if (room) placed.push(room)
  }

  return placed
}

function overlaps(a: Room, b: Room, buffer: number): boolean {
  return (
    a.x < b.x + b.width  + buffer &&
    a.x + a.width  + buffer > b.x &&
    a.y < b.y + b.height + buffer &&
    a.y + a.height + buffer > b.y
  )
}

function makeRoom(x: number, y: number, w: number, h: number, index: number): Room {
  return {
    id:           crypto.randomUUID(),
    name:         `Room ${index + 1}`,
    label:        '',
    showLabel:    false,
    labelOffset:  { x: 0, y: 0 },
    description:  '',
    notes:        '',
    x, y,
    width:        w,
    height:       h,
    settings:     {},
    cellOverrides: {}
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Mulberry32 seeded PRNG — returns values in [0, 1) */
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s += 0x6d2b79f5
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}
