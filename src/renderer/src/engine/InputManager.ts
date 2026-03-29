import { Room, Hallway, Level } from '../types/map'
import { computePath, resolveExitPoints, nearestWallExit } from './hallwayPath'
import { useMapStore } from '../store/mapStore'
import { MapRenderer, ResizeHandle } from './MapRenderer'
import {
  AddRoomCommand,
  RemoveRoomCommand,
  MoveRoomCommand,
  ResizeRoomCommand,
  AddHallwayCommand,
  RemoveHallwayCommand,
  UpdateHallwayExitsCommand
} from './commands'

// ── Interaction state machine ─────────────────────────────────────────────────

type Rect = { x: number; y: number; width: number; height: number }

type InteractionState =
  | { kind: 'idle' }
  | { kind: 'room_placing';     startCol: number; startRow: number }
  | { kind: 'room_moving';      roomId: string; origX: number; origY: number; startCol: number; startRow: number }
  | { kind: 'room_resizing';    roomId: string; handle: ResizeHandle; origRect: Rect }
  | { kind: 'hallway_placing';  roomAId: string }
  | { kind: 'hallway_endpoint'; hallwayId: string; end: 'A' | 'B'; room: { id: string; x: number; y: number; width: number; height: number }; origExitA?: { x: number; y: number }; origExitB?: { x: number; y: number } }

// ── Handle hit tolerance (in grid cells) ─────────────────────────────────────

const HANDLE_RADIUS = 0.6

// ── InputManager ─────────────────────────────────────────────────────────────

export class InputManager {
  private state: InteractionState = { kind: 'idle' }

  private _onMousedown: (e: MouseEvent) => void
  private _onMousemove: (e: MouseEvent) => void
  private _onMouseup:   (e: MouseEvent) => void
  private _onMouseleave: () => void
  private _onKeydown:   (e: KeyboardEvent) => void

  constructor(
    private readonly canvas:   HTMLCanvasElement,
    private readonly renderer: MapRenderer
  ) {
    this._onMousedown  = this.handleMousedown.bind(this)
    this._onMousemove  = this.handleMousemove.bind(this)
    this._onMouseup    = this.handleMouseup.bind(this)
    this._onMouseleave = this.handleMouseleave.bind(this)
    this._onKeydown    = this.handleKeydown.bind(this)

    canvas.addEventListener('mousedown',  this._onMousedown)
    canvas.addEventListener('mousemove',  this._onMousemove)
    canvas.addEventListener('mouseup',    this._onMouseup)
    canvas.addEventListener('mouseleave', this._onMouseleave)
    window.addEventListener('keydown',    this._onKeydown)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private cell(e: MouseEvent): { col: number; row: number; fx: number; fy: number } | null {
    return this.renderer.worldToGrid(e.clientX, e.clientY)
  }

  private getStore() {
    return useMapStore.getState()
  }

  private getActiveLevel(): Level | null {
    const { project, activeLevelId } = this.getStore()
    if (!project || !activeLevelId) return null
    if (project.overworld.id === activeLevelId) return project.overworld
    return project.dungeonLevels.find((l) => l.id === activeLevelId) ?? null
  }

  private hitRoom(col: number, row: number, level: Level): Room | null {
    // Iterate in reverse so rooms drawn on top get priority
    for (let i = level.rooms.length - 1; i >= 0; i--) {
      const r = level.rooms[i]
      if (col >= r.x && col < r.x + r.width && row >= r.y && row < r.y + r.height) return r
    }
    return null
  }

  /**
   * Hit-tests resize handles using floating-point grid coordinates so that
   * clicks on either side of a cell boundary are caught correctly.
   * Handles sit exactly on room boundary lines, so integer col/row alone
   * would fail for clicks on the outer half of each handle.
   */
  private hitHandle(
    fx: number, fy: number, room: Room
  ): ResizeHandle | null {
    const hw = room.width  / 2
    const hh = room.height / 2
    const candidates: Array<{ handle: ResizeHandle; hx: number; hy: number }> = [
      { handle: 'TL', hx: room.x,               hy: room.y },
      { handle: 'T',  hx: room.x + hw,          hy: room.y },
      { handle: 'TR', hx: room.x + room.width,  hy: room.y },
      { handle: 'R',  hx: room.x + room.width,  hy: room.y + hh },
      { handle: 'BR', hx: room.x + room.width,  hy: room.y + room.height },
      { handle: 'B',  hx: room.x + hw,          hy: room.y + room.height },
      { handle: 'BL', hx: room.x,               hy: room.y + room.height },
      { handle: 'L',  hx: room.x,               hy: room.y + hh }
    ]
    for (const c of candidates) {
      if (Math.abs(fx - c.hx) <= HANDLE_RADIUS && Math.abs(fy - c.hy) <= HANDLE_RADIUS) {
        return c.handle
      }
    }
    return null
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────────

  private handleMousedown(e: MouseEvent): void {
    if (e.button !== 0) return
    const c = this.cell(e)
    if (!c) return

    const store = this.getStore()
    const level = this.getActiveLevel()
    if (!level) return

    switch (store.activeTool) {
      case 'room': {
        this.state = { kind: 'room_placing', startCol: c.col, startRow: c.row }
        this.renderer.setGhostRoom(c.col, c.row, 1, 1)
        break
      }

      case 'select': {
        const { selectedId } = store

        // If a hallway is selected, check for endpoint handle hit first
        if (selectedId) {
          const selHallway = level.hallways.find((h) => h.id === selectedId)
          if (selHallway) {
            const roomA = level.rooms.find((r) => r.id === selHallway.roomAId)
            const roomB = level.rooms.find((r) => r.id === selHallway.roomBId)
            if (roomA && roomB) {
              const { start, end } = resolveExitPoints(
                roomA, roomB, selHallway.waypoints, selHallway.exitA, selHallway.exitB
              )
              // Handles sit at cell center (+0.5)
              for (const [pt, which, room] of [
                [start, 'A', roomA],
                [end,   'B', roomB]
              ] as [{ x: number; y: number }, 'A' | 'B', typeof roomA][]) {
                if (Math.abs(c.fx - (pt.x + 0.5)) <= HANDLE_RADIUS &&
                    Math.abs(c.fy - (pt.y + 0.5)) <= HANDLE_RADIUS) {
                  this.state = {
                    kind:      'hallway_endpoint',
                    hallwayId: selHallway.id,
                    end:       which,
                    room,
                    origExitA: selHallway.exitA,
                    origExitB: selHallway.exitB
                  }
                  break
                }
              }
              if (this.state.kind === 'hallway_endpoint') break
            }
          }
        }

        // If a room is selected, check for handle hit first
        if (selectedId) {
          const selRoom = level.rooms.find((r) => r.id === selectedId)
          if (selRoom) {
            const handle = this.hitHandle(c.fx, c.fy, selRoom)
            if (handle) {
              this.state = {
                kind:     'room_resizing',
                roomId:   selRoom.id,
                handle,
                origRect: { x: selRoom.x, y: selRoom.y, width: selRoom.width, height: selRoom.height }
              }
              this.renderer.setGhostRoom(selRoom.x, selRoom.y, selRoom.width, selRoom.height)
              break
            }
          }
        }

        const room = this.hitRoom(c.col, c.row, level)
        if (room) {
          store.setSelected(room.id)
          this.renderer.setSelection(room.id)
          this.state = {
            kind:     'room_moving',
            roomId:   room.id,
            origX:    room.x,
            origY:    room.y,
            startCol: c.col,
            startRow: c.row
          }
          break
        }

        const hallway = this.hitHallway(c.col, c.row, level)
        if (hallway) {
          store.setSelected(hallway.id)
          this.renderer.setSelection(hallway.id)
        } else {
          store.setSelected(null)
          this.renderer.setSelection(null)
        }
        break
      }

      case 'hallway': {
        const room = this.hitRoom(c.col, c.row, level)
        if (!room) break

        if (this.state.kind === 'hallway_placing') {
          const { roomAId } = this.state
          if (roomAId !== room.id) {
            const { activeLevelId, dispatch } = store
            if (activeLevelId) {
              const hallway: Hallway = {
                id:        crypto.randomUUID(),
                roomAId,
                roomBId:   room.id,
                waypoints: [],
                width:     1,
                settings:  {}
              }
              dispatch(new AddHallwayCommand(activeLevelId, hallway))
            }
          }
          this.state = { kind: 'idle' }
          this.renderer.clearHallwayPreview()
        } else {
          this.state = { kind: 'hallway_placing', roomAId: room.id }
          this.renderer.setHallwayPreview(room.id, c.col, c.row)
        }
        break
      }

      case 'delete': {
        const room = this.hitRoom(c.col, c.row, level)
        if (room) {
          const { activeLevelId, dispatch } = store
          if (activeLevelId) dispatch(new RemoveRoomCommand(activeLevelId, room))
          store.setSelected(null)
          this.renderer.setSelection(null)
        } else {
          // Check hallways
          const hallway = this.hitHallway(c.col, c.row, level)
          if (hallway) {
            const { activeLevelId, dispatch } = store
            if (activeLevelId) dispatch(new RemoveHallwayCommand(activeLevelId, hallway))
          }
        }
        break
      }
    }
  }

  private handleMousemove(e: MouseEvent): void {
    const c = this.cell(e)
    if (!c) return

    const level = this.getActiveLevel()

    switch (this.state.kind) {
      case 'room_placing': {
        const { startCol, startRow } = this.state
        const { w: gw, h: gh } = this.gridBounds()
        const col = Math.max(0, Math.min(c.col, gw - 1))
        const row = Math.max(0, Math.min(c.row, gh - 1))
        const x = Math.min(startCol, col)
        const y = Math.min(startRow, row)
        const w = Math.abs(col - startCol) + 1
        const h = Math.abs(row - startRow) + 1
        this.renderer.setGhostRoom(x, y, w, h)
        break
      }

      case 'room_moving': {
        const { roomId, origX, origY, startCol, startRow } = this.state
        const dx = c.col - startCol
        const dy = c.row - startRow
        const room = this.getActiveLevel()?.rooms.find((r) => r.id === roomId)
        if (room) {
          const cr = this.clampRect({ x: origX + dx, y: origY + dy, width: room.width, height: room.height })
          this.renderer.setMovePreview(roomId, cr.x, cr.y)
        }
        break
      }

      case 'room_resizing': {
        const { handle, origRect } = this.state
        const r = this.computeResizeRect(c.col, c.row, handle, origRect)
        this.renderer.setGhostRoom(r.x, r.y, r.width, r.height)
        break
      }

      case 'hallway_endpoint': {
        const snapped = nearestWallExit(this.state.room, { x: c.fx, y: c.fy })
        this.renderer.setEndpointPreview(snapped)
        break
      }

      case 'hallway_placing': {
        this.renderer.setHallwayPreview(this.state.roomAId, c.col, c.row)
        break
      }
    }

    // Hover hit-test (only in idle state to avoid flicker)
    if (level && this.state.kind === 'idle') {
      const room = this.hitRoom(c.col, c.row, level)
      if (room) {
        this.renderer.setHover(room.id)
      } else {
        const hallway = this.hitHallway(c.col, c.row, level)
        this.renderer.setHover(hallway?.id ?? null)
      }
    }
  }

  private handleMouseup(e: MouseEvent): void {
    if (e.button !== 0) {
      this.state = { kind: 'idle' }
      return
    }

    const c     = this.cell(e)
    const store = this.getStore()

    switch (this.state.kind) {
      case 'room_placing': {
        if (c && store.activeLevelId) {
          const { startCol, startRow } = this.state
          const { w: gw, h: gh } = this.gridBounds()
          const col = Math.max(0, Math.min(c.col, gw - 1))
          const row = Math.max(0, Math.min(c.row, gh - 1))
          const rawX = Math.min(startCol, col)
          const rawY = Math.min(startRow, row)
          const rawW = Math.max(2, Math.abs(col - startCol) + 1)
          const rawH = Math.max(2, Math.abs(row - startRow) + 1)
          const { x, y, width: w, height: h } = this.clampRect({ x: rawX, y: rawY, width: rawW, height: rawH })

          const room: Room = {
            id:           crypto.randomUUID(),
            name:         `Room ${(this.getActiveLevel()?.rooms.length ?? 0) + 1}`,
            description:  '',
            x, y, width: w, height: h,
            settings:     {},
            cellOverrides: {}
          }
          store.dispatch(new AddRoomCommand(store.activeLevelId, room))
          store.setSelected(room.id)
          this.renderer.setSelection(room.id)
        }
        this.renderer.clearGhost()
        this.state = { kind: 'idle' }
        break
      }

      case 'room_moving': {
        if (c) {
          const { roomId, origX, origY, startCol, startRow } = this.state
          const dx    = c.col - startCol
          const dy    = c.row - startRow
          const level = this.getActiveLevel()
          const room  = level?.rooms.find((r) => r.id === roomId)
          if (room && store.activeLevelId) {
            const { x: newX, y: newY } = this.clampRect({ x: origX + dx, y: origY + dy, width: room.width, height: room.height })
            if (newX !== origX || newY !== origY) {
              store.dispatch(new MoveRoomCommand(
                store.activeLevelId,
                roomId,
                { x: origX, y: origY },
                { x: newX,  y: newY }
              ))
              this.renderer.setSelection(roomId)
            }
          }
        }
        this.renderer.clearMovePreview()
        this.state = { kind: 'idle' }
        break
      }

      case 'room_resizing': {
        if (c && store.activeLevelId) {
          const { roomId, handle, origRect } = this.state
          const newRect = this.computeResizeRect(c.col, c.row, handle, origRect)
          const changed =
            newRect.x !== origRect.x || newRect.y !== origRect.y ||
            newRect.width !== origRect.width || newRect.height !== origRect.height
          if (changed) {
            store.dispatch(new ResizeRoomCommand(store.activeLevelId, roomId, origRect, newRect))
            this.renderer.setSelection(roomId)
          }
        }
        this.renderer.clearGhost()
        this.state = { kind: 'idle' }
        break
      }

      case 'hallway_endpoint': {
        if (c && store.activeLevelId) {
          const { hallwayId, end, room, origExitA, origExitB } = this.state
          const snapped = nearestWallExit(room, { x: c.fx, y: c.fy })
          const to = end === 'A'
            ? { exitA: snapped, exitB: origExitB }
            : { exitA: origExitA, exitB: snapped }
          store.dispatch(new UpdateHallwayExitsCommand(
            store.activeLevelId,
            hallwayId,
            { exitA: origExitA, exitB: origExitB },
            to
          ))
          this.renderer.setSelection(hallwayId)
        }
        this.renderer.clearEndpointPreview()
        this.state = { kind: 'idle' }
        break
      }
    }
  }

  private handleMouseleave(): void {
    this.renderer.setHover(null)
    this.renderer.clearEndpointPreview()
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Don't intercept when focus is in an input/textarea
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    const store = this.getStore()
    const ctrl  = e.ctrlKey || e.metaKey

    if (ctrl && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      store.undo()
      // Re-sync renderer after undo
      const level = this.getActiveLevel()
      if (level) this.renderer.loadLevel(level)
      this.syncSelectionAfterCommand()
      return
    }

    if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault()
      store.redo()
      const level = this.getActiveLevel()
      if (level) this.renderer.loadLevel(level)
      this.syncSelectionAfterCommand()
      return
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const { selectedId, activeLevelId } = store
      if (!selectedId || !activeLevelId) return
      const level = this.getActiveLevel()
      if (!level) return

      const room = level.rooms.find((r) => r.id === selectedId)
      if (room) {
        store.dispatch(new RemoveRoomCommand(activeLevelId, room))
        store.setSelected(null)
        this.renderer.setSelection(null)
        return
      }
      const hallway = level.hallways.find((h) => h.id === selectedId)
      if (hallway) {
        store.dispatch(new RemoveHallwayCommand(activeLevelId, hallway))
        store.setSelected(null)
        this.renderer.setSelection(null)
      }
    }

    // Tool shortcuts
    if (!ctrl) {
      switch (e.key) {
        case 'r': case 'R': store.setActiveTool('room');    break
        case 'h': case 'H': store.setActiveTool('hallway'); break
        case 's': case 'S': store.setActiveTool('select');  break
        case 'x': case 'X': store.setActiveTool('delete');  break
        case 'Escape':
          if (this.state.kind === 'hallway_placing') {
            this.renderer.clearHallwayPreview()
            this.state = { kind: 'idle' }
          }
          store.setSelected(null)
          this.renderer.setSelection(null)
          break
      }
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  private gridBounds(): { w: number; h: number } {
    const level = this.getActiveLevel()
    return { w: level?.settings.gridWidth ?? 256, h: level?.settings.gridHeight ?? 256 }
  }

  /**
   * Clamps a rect so it fits entirely within the grid.
   * Width/height are preserved; only x/y are adjusted.
   */
  private clampRect(r: Rect): Rect {
    const { w, h } = this.gridBounds()
    const x = Math.max(0, Math.min(r.x, w - r.width))
    const y = Math.max(0, Math.min(r.y, h - r.height))
    return { x, y, width: r.width, height: r.height }
  }

  /**
   * Clamps the unconstrained corner/edge of a resize operation so the room
   * never grows outside the grid. The fixed anchor is unchanged.
   */
  private clampResizeCursor(col: number, row: number): { col: number; row: number } {
    const { w, h } = this.gridBounds()
    return { col: Math.max(0, Math.min(col, w)), row: Math.max(0, Math.min(row, h)) }
  }

  /**
   * Given a mouse grid position, a handle being dragged, and the room's
   * original rect, returns the new rect that results from the drag.
   * Width and height are clamped to a minimum of 2.
   */
  private computeResizeRect(col: number, row: number, handle: ResizeHandle, orig: Rect): Rect {
    ;({ col, row } = this.clampResizeCursor(col, row))
    const MIN          = 2
    const fixedRight   = orig.x + orig.width
    const fixedBottom  = orig.y + orig.height

    switch (handle) {
      case 'TL': {
        const x = Math.min(col, fixedRight  - MIN)
        const y = Math.min(row, fixedBottom - MIN)
        return { x, y, width: fixedRight - x, height: fixedBottom - y }
      }
      case 'T': {
        const y = Math.min(row, fixedBottom - MIN)
        return { x: orig.x, y, width: orig.width, height: fixedBottom - y }
      }
      case 'TR': {
        const y = Math.min(row, fixedBottom - MIN)
        return { x: orig.x, y, width: Math.max(col - orig.x, MIN), height: fixedBottom - y }
      }
      case 'R':
        return { x: orig.x, y: orig.y, width: Math.max(col - orig.x, MIN), height: orig.height }
      case 'BR':
        return { x: orig.x, y: orig.y, width: Math.max(col - orig.x, MIN), height: Math.max(row - orig.y, MIN) }
      case 'B':
        return { x: orig.x, y: orig.y, width: orig.width, height: Math.max(row - orig.y, MIN) }
      case 'BL': {
        const x = Math.min(col, fixedRight - MIN)
        return { x, y: orig.y, width: fixedRight - x, height: Math.max(row - orig.y, MIN) }
      }
      case 'L': {
        const x = Math.min(col, fixedRight - MIN)
        return { x, y: orig.y, width: fixedRight - x, height: orig.height }
      }
    }
  }

  private hitHallway(col: number, row: number, level: Level): Hallway | null {
    for (const hallway of level.hallways) {
      const roomA = level.rooms.find((r) => r.id === hallway.roomAId)
      const roomB = level.rooms.find((r) => r.id === hallway.roomBId)
      if (!roomA || !roomB) continue
      const path = computePath(roomA, roomB, hallway.waypoints)
      if (path.some((p) => p.x === col && p.y === row)) return hallway
    }
    return null
  }

  /**
   * After undo/redo the previously selected object may no longer exist.
   * Clears selection if the selected id is not found in the new level state.
   */
  private syncSelectionAfterCommand(): void {
    const { selectedId } = this.getStore()
    if (!selectedId) return
    const level = this.getActiveLevel()
    if (!level) {
      useMapStore.getState().setSelected(null)
      this.renderer.setSelection(null)
      return
    }
    const exists =
      level.rooms.some((r) => r.id === selectedId) ||
      level.hallways.some((h) => h.id === selectedId)
    if (!exists) {
      useMapStore.getState().setSelected(null)
      this.renderer.setSelection(null)
    } else {
      this.renderer.setSelection(selectedId)
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('mousedown',  this._onMousedown)
    this.canvas.removeEventListener('mousemove',  this._onMousemove)
    this.canvas.removeEventListener('mouseup',    this._onMouseup)
    this.canvas.removeEventListener('mouseleave', this._onMouseleave)
    window.removeEventListener('keydown',         this._onKeydown)
  }
}
