import { Room, Hallway, Level, Waypoint, ObjectPlacement, Player } from '../types/map'
import { computePath, expandPath, resolveExitPoints, nearestWallExit } from './hallwayPath'
import { useMapStore, ClipboardPayload } from '../store/mapStore'
import { useAppSettings } from '../store/appSettingsStore'
import { matchesBinding } from '../store/keyBindings'
import { MapRenderer, ResizeHandle } from './MapRenderer'
import {
  AddRoomCommand,
  RemoveRoomCommand,
  MoveRoomCommand,
  ResizeRoomCommand,
  AddHallwayCommand,
  RemoveHallwayCommand,
  UpdateHallwayExitsCommand,
  UpdateHallwayWaypointsCommand,
  PlaceObjectCommand,
  MoveObjectCommand,
  RemoveObjectCommand,
  UpdateRoomLabelOffsetCommand,
  UpdatePlayerPlacementCommand
} from './commands'

// ── Context menu types ────────────────────────────────────────────────────────

export type ContextMenuAction =
  | { kind: 'add_waypoint';    hallwayId: string; col: number; row: number }
  | { kind: 'remove_waypoint'; hallwayId: string; waypointIndex: number }
  | { kind: 'delete_hallway';  hallwayId: string }
  | { kind: 'copy_room';       roomId: string }
  | { kind: 'cut_room';        roomId: string }
  | { kind: 'delete_room';     roomId: string }
  | { kind: 'delete_level';    levelId: string }
  | { kind: 'copy_object';     placementId: string }
  | { kind: 'cut_object';      placementId: string }
  | { kind: 'delete_object';   placementId: string }
  | { kind: 'unplace_player';  playerId: string }
  | { kind: 'cut_player';      playerId: string }
  | { kind: 'delete_player';   playerId: string }
  | { kind: 'paste_player';    playerId: string; fx: number; fy: number; label: string }
  | { kind: 'paste';           col: number; row: number; fx: number; fy: number; label: string }

export interface ContextMenuPayload {
  screenX: number
  screenY: number
  items:   ContextMenuAction[]
}

// ── Interaction state machine ─────────────────────────────────────────────────

type Rect = { x: number; y: number; width: number; height: number }

type InteractionState =
  | { kind: 'idle' }
  | { kind: 'room_placing';     startCol: number; startRow: number }
  | { kind: 'room_moving';      roomId: string; origX: number; origY: number; startCol: number; startRow: number }
  | { kind: 'room_resizing';    roomId: string; handle: ResizeHandle; origRect: Rect }
  | { kind: 'hallway_placing';  roomAId: string }
  | { kind: 'hallway_endpoint'; hallwayId: string; end: 'A' | 'B'; room: { id: string; x: number; y: number; width: number; height: number }; origExitA?: { x: number; y: number }; origExitB?: { x: number; y: number } }
  | { kind: 'hallway_waypoint'; hallwayId: string; waypointIndex: number; origWaypoints: Waypoint[] }
  | { kind: 'object_moving';    placementId: string; origX: number; origY: number; startFx: number; startFy: number }
  | { kind: 'label_moving';     roomId: string; origOffset: { x: number; y: number }; startFx: number; startFy: number }
  | { kind: 'player_moving';   playerId: string; origX: number; origY: number; startFx: number; startFy: number }

// ── Handle hit tolerance (in grid cells) ─────────────────────────────────────

const HANDLE_RADIUS = 0.6

// ── InputManager ─────────────────────────────────────────────────────────────

const PAN_THRESHOLD_PX = 4

export class InputManager {
  private state: InteractionState = { kind: 'idle' }
  private rightClickOrigin: { x: number; y: number; e: MouseEvent } | null = null
  private snapToGrid = false

  setSnapToGrid(snap: boolean): void { this.snapToGrid = snap }

  private snapFx(fx: number): number { return this.snapToGrid ? Math.floor(fx) + 0.5 : fx }
  private snapFy(fy: number): number { return this.snapToGrid ? Math.floor(fy) + 0.5 : fy }

  private _onMousedown:    (e: MouseEvent) => void
  private _onMousemove:    (e: MouseEvent) => void
  private _onMouseup:      (e: MouseEvent) => void
  private _onMouseleave:   () => void
  private _onKeydown:      (e: KeyboardEvent) => void
  private _onContextMenu:  (e: MouseEvent) => void

  constructor(
    private readonly canvas:   HTMLCanvasElement,
    private readonly renderer: MapRenderer,
    private readonly onContextMenu?: (payload: ContextMenuPayload | null) => void
  ) {
    this._onMousedown   = this.handleMousedown.bind(this)
    this._onMousemove   = this.handleMousemove.bind(this)
    this._onMouseup     = this.handleMouseup.bind(this)
    this._onMouseleave  = this.handleMouseleave.bind(this)
    this._onKeydown     = this.handleKeydown.bind(this)
    this._onContextMenu = (e: MouseEvent) => e.preventDefault()

    canvas.addEventListener('mousedown',   this._onMousedown)
    canvas.addEventListener('mousemove',   this._onMousemove)
    canvas.addEventListener('mouseup',     this._onMouseup)
    canvas.addEventListener('mouseleave',  this._onMouseleave)
    canvas.addEventListener('contextmenu', this._onContextMenu)
    window.addEventListener('keydown',     this._onKeydown)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private cell(e: MouseEvent): { col: number; row: number; fx: number; fy: number } | null {
    return this.renderer.worldToGrid(e.clientX, e.clientY)
  }

  private getStore() {
    return useMapStore.getState()
  }

  private buildPasteItem(col: number, row: number, fx: number, fy: number): ContextMenuAction | null {
    const { clipboard, appCatalog, project } = this.getStore()
    if (!clipboard) return null
    if (clipboard.kind === 'player') {
      const player = project?.players.find((p) => p.id === clipboard.playerId)
      const name = player?.name.trim() || 'Player'
      return { kind: 'paste_player', playerId: clipboard.playerId, fx, fy, label: `Paste ${name}` }
    }
    if (clipboard.kind === 'room') {
      return { kind: 'paste', col, row, fx, fy, label: 'Paste Room' }
    }
    // placement
    const allDefs = [...appCatalog, ...(project?.projectCatalog ?? [])]
    const def = allDefs.find((d) => d.id === clipboard.placement.definitionId)
    return { kind: 'paste', col, row, fx, fy, label: `Paste ${def?.name ?? 'Object'}` }
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
    if (e.button === 2) { this.rightClickOrigin = { x: e.clientX, y: e.clientY, e }; return }
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

            // Check waypoint handles (no rooms needed — waypoints are absolute positions)
            for (let i = 0; i < selHallway.waypoints.length; i++) {
              const wp = selHallway.waypoints[i]
              if (Math.abs(c.fx - (wp.x + 0.5)) <= HANDLE_RADIUS &&
                  Math.abs(c.fy - (wp.y + 0.5)) <= HANDLE_RADIUS) {
                this.state = {
                  kind:          'hallway_waypoint',
                  hallwayId:     selHallway.id,
                  waypointIndex: i,
                  origWaypoints: selHallway.waypoints.slice()
                }
                break
              }
            }
            if (this.state.kind === 'hallway_waypoint') break
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

        // Hit-test player tokens (they render above everything)
        const hitPlayerToken = this.renderer.hitPlayer(c.fx, c.fy)
        if (hitPlayerToken) {
          store.setSelectedPlayer(hitPlayerToken.id)
          this.renderer.setPlayerSelection(hitPlayerToken)
          if (hitPlayerToken.placement) {
            this.state = {
              kind:    'player_moving',
              playerId: hitPlayerToken.id,
              origX:   hitPlayerToken.placement.x,
              origY:   hitPlayerToken.placement.y,
              startFx: c.fx,
              startFy: c.fy
            }
          }
          break
        }

        // Hit-test visible room labels (rendered above floor, draggable)
        const labelRoom = this.renderer.hitLabel(c.fx, c.fy, level)
        if (labelRoom) {
          this.state = {
            kind:       'label_moving',
            roomId:     labelRoom.id,
            origOffset: { ...labelRoom.labelOffset },
            startFx:    c.fx,
            startFy:    c.fy
          }
          break
        }

        // Hit-test placements first (they render above the floor)
        const placement = this.hitPlacement(c.fx, c.fy, level)
        if (placement) {
          store.setSelected(placement.id)
          this.renderer.setSelection(placement.id)
          this.state = {
            kind:        'object_moving',
            placementId: placement.id,
            origX:       placement.x,
            origY:       placement.y,
            startFx:     c.fx,
            startFy:     c.fy
          }
          break
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

      case 'object': {
        const { armedDefinitionId, activeLevelId, dispatch, appCatalog, project } = store
        if (!armedDefinitionId || !activeLevelId) break
        const allDefs = [...(appCatalog ?? []), ...(project?.projectCatalog ?? [])]
        const def = allDefs.find((d) => d.id === armedDefinitionId)
        if (!def) break
        const px = this.snapFx(c.fx)
        const py = this.snapFy(c.fy)
        const placement: ObjectPlacement = def.kind === 'token'
          ? { id: crypto.randomUUID(), definitionId: armedDefinitionId, kind: 'token',
              x: px, y: py, propertyValues: {} }
          : { id: crypto.randomUUID(), definitionId: armedDefinitionId, kind: 'prop',
              x: px, y: py, rotation: 0, propertyValues: {} }
        dispatch(new PlaceObjectCommand(activeLevelId, placement))
        break
      }

      case 'player_place': {
        const { armedPlayerId, activeLevelId, dispatch } = store
        if (!armedPlayerId || !activeLevelId) break
        const fx = this.snapFx(c.fx)
        const fy = this.snapFy(c.fy)
        dispatch(new UpdatePlayerPlacementCommand(armedPlayerId, { levelId: activeLevelId, x: fx, y: fy }))
        store.setArmedPlayer(null)
        store.setActiveTool('select')
        this.renderer.clearPlayerGhost()
        this.renderer.setSelection(null)
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

    }
  }

  private handleMousemove(e: MouseEvent): void {
    // If right button is held and moved beyond threshold, treat as pan — suppress context menu
    if (this.rightClickOrigin) {
      const dx = e.clientX - this.rightClickOrigin.x
      const dy = e.clientY - this.rightClickOrigin.y
      if (Math.sqrt(dx * dx + dy * dy) > PAN_THRESHOLD_PX) {
        this.rightClickOrigin = null
      }
    }

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

      case 'hallway_waypoint': {
        this.renderer.setEndpointPreview({ x: c.col, y: c.row })
        break
      }

      case 'hallway_placing': {
        this.renderer.setHallwayPreview(this.state.roomAId, c.col, c.row)
        break
      }

      case 'object_moving': {
        const { origX, origY, startFx, startFy } = this.state
        this.renderer.setObjectMovePreview(
          this.state.placementId,
          this.snapFx(origX + (c.fx - startFx)),
          this.snapFy(origY + (c.fy - startFy))
        )
        break
      }

      case 'label_moving': {
        const { origOffset, startFx, startFy } = this.state
        const newOffsetX = origOffset.x + (c.fx - startFx)
        const newOffsetY = origOffset.y + (c.fy - startFy)
        this.renderer.moveLabelPreview(this.state.roomId, newOffsetX, newOffsetY)
        break
      }

      case 'player_moving': {
        const { origX, origY, startFx, startFy } = this.state
        const nx = this.snapFx(origX + (c.fx - startFx))
        const ny = this.snapFy(origY + (c.fy - startFy))
        this.renderer.movePlayerPreview(this.state.playerId, nx, ny)
        break
      }
    }

    // Move placement ghost when object tool is armed
    const { activeTool, armedDefinitionId, armedPlayerId } = this.getStore()
    if (activeTool === 'object' && armedDefinitionId) {
      this.renderer.movePlacementGhost(this.snapFx(c.fx), this.snapFy(c.fy))
    }
    if (activeTool === 'player_place' && armedPlayerId) {
      this.renderer.movePlayerGhost(this.snapFx(c.fx), this.snapFy(c.fy))
    }

    // Hover hit-test (only in idle state to avoid flicker)
    if (level && this.state.kind === 'idle') {
      const room = this.hitRoom(c.col, c.row, level)
      if (room) {
        this.renderer.setHover(room.id)
      } else {
        const hits = this.hitHallwayAll(c.col, c.row, level)
        // If the currently selected hallway is under the cursor, keep highlighting it
        const { selectedId } = this.getStore()
        const preferred = hits.find((h) => h.id === selectedId) ?? hits[0]
        this.renderer.setHover(preferred?.id ?? null)
      }
    }
  }

  private handleMouseup(e: MouseEvent): void {
    if (e.button === 2) {
      // Fire context menu only if the right button wasn't dragged
      if (this.rightClickOrigin) {
        this.handleRightClick(this.rightClickOrigin.e)
        this.rightClickOrigin = null
      }
      return
    }
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
            label:        '',
            showLabel:    false,
            labelOffset:  { x: 0, y: 0 },
            description:  '',
            notes:        '',
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

      case 'hallway_waypoint': {
        if (c && store.activeLevelId) {
          const { hallwayId, waypointIndex, origWaypoints } = this.state
          const movedWp = origWaypoints[waypointIndex]
          if (movedWp && (c.col !== movedWp.x || c.row !== movedWp.y)) {
            const newWaypoints = origWaypoints.map((wp, i) =>
              i === waypointIndex ? { x: c.col, y: c.row } : wp
            )
            store.dispatch(new UpdateHallwayWaypointsCommand(
              store.activeLevelId,
              hallwayId,
              origWaypoints,
              newWaypoints
            ))
          }
          this.renderer.setSelection(hallwayId)
        }
        this.renderer.clearEndpointPreview()
        this.state = { kind: 'idle' }
        break
      }

      case 'object_moving': {
        const { placementId, origX, origY, startFx, startFy } = this.state
        if (c && store.activeLevelId) {
          const newX = this.snapFx(origX + (c.fx - startFx))
          const newY = this.snapFy(origY + (c.fy - startFy))
          if (newX !== origX || newY !== origY) {
            store.dispatch(new MoveObjectCommand(store.activeLevelId, placementId, { x: origX, y: origY }, { x: newX, y: newY }))
          }
          this.renderer.setSelection(placementId)
        }
        this.renderer.clearObjectMovePreview()
        this.state = { kind: 'idle' }
        break
      }

      case 'label_moving': {
        const { roomId, origOffset, startFx, startFy } = this.state
        if (c && store.activeLevelId) {
          const newOffset = {
            x: origOffset.x + (c.fx - startFx),
            y: origOffset.y + (c.fy - startFy)
          }
          if (newOffset.x !== origOffset.x || newOffset.y !== origOffset.y) {
            store.dispatch(new UpdateRoomLabelOffsetCommand(store.activeLevelId, roomId, origOffset, newOffset))
          }
        }
        this.state = { kind: 'idle' }
        break
      }

      case 'player_moving': {
        const { playerId, origX, origY, startFx, startFy } = this.state
        if (c && store.activeLevelId) {
          const newX = this.snapFx(origX + (c.fx - startFx))
          const newY = this.snapFy(origY + (c.fy - startFy))
          if (newX !== origX || newY !== origY) {
            store.dispatch(new UpdatePlayerPlacementCommand(playerId, { levelId: store.activeLevelId, x: newX, y: newY }))
          }
        }
        this.state = { kind: 'idle' }
        break
      }
    }
  }

  private handleMouseleave(): void {
    this.renderer.setHover(null)
    this.renderer.clearEndpointPreview()
    this.renderer.hidePlacementGhost()
    this.renderer.hidePlayerGhost()
  }

  private handleRightClick(e: MouseEvent): void {
    if (!this.onContextMenu) return
    const c = this.cell(e)
    if (!c) return
    const store = this.getStore()
    const level = this.getActiveLevel()
    if (!level) return

    // Player tokens take top priority
    const hitPlayer = this.renderer.hitPlayer(c.fx, c.fy)
    if (hitPlayer) {
      store.setSelectedPlayer(hitPlayer.id)
      this.renderer.setPlayerSelection(hitPlayer)
      store.setClipboard({ kind: 'player', playerId: hitPlayer.id })
      const playerItems: ContextMenuAction[] = []
      if (hitPlayer.placement) {
        playerItems.push({ kind: 'unplace_player', playerId: hitPlayer.id })
      }
      playerItems.push({ kind: 'cut_player', playerId: hitPlayer.id })
      playerItems.push({ kind: 'delete_player', playerId: hitPlayer.id })
      this.onContextMenu({ screenX: e.clientX, screenY: e.clientY, items: playerItems })
      return
    }

    // Placements take priority over rooms/hallways
    const placement = this.hitPlacement(c.fx, c.fy, level)
    if (placement) {
      if (placement.id !== store.selectedId) {
        store.setSelected(placement.id)
        this.renderer.setSelection(placement.id)
      }
      const pasteItem = this.buildPasteItem(c.col, c.row, c.fx, c.fy)
      const items: ContextMenuAction[] = [
        ...(pasteItem ? [pasteItem] : []),
        { kind: 'copy_object',   placementId: placement.id },
        { kind: 'cut_object',    placementId: placement.id },
        { kind: 'delete_object', placementId: placement.id },
      ]
      this.onContextMenu({ screenX: e.clientX, screenY: e.clientY, items })
      return
    }

    // Rooms take priority over hallways
    const room = this.hitRoom(c.col, c.row, level)
    if (room) {
      if (room.id !== store.selectedId) {
        store.setSelected(room.id)
        this.renderer.setSelection(room.id)
      }
      const pasteItem = this.buildPasteItem(c.col, c.row, c.fx, c.fy)
      const items: ContextMenuAction[] = [
        ...(pasteItem ? [pasteItem] : []),
        { kind: 'copy_room',   roomId: room.id },
        { kind: 'cut_room',    roomId: room.id },
        { kind: 'delete_room', roomId: room.id },
      ]
      this.onContextMenu({ screenX: e.clientX, screenY: e.clientY, items })
      return
    }

    // Find which hallway was right-clicked. Prefer the already-selected hallway
    // so repeated right-clicks on the same hallway don't cycle selection.
    const { selectedId } = store
    let hallway = level.hallways.find((h) => h.id === selectedId) ?? null

    if (hallway) {
      // Verify the cursor is actually on this hallway's path
      const roomA = level.rooms.find((r) => r.id === hallway!.roomAId)
      const roomB = level.rooms.find((r) => r.id === hallway!.roomBId)
      if (!roomA || !roomB) {
        hallway = null
      } else {
        const path = expandPath(
          computePath(roomA, roomB, hallway.waypoints, hallway.exitA, hallway.exitB),
          hallway.width
        )
        if (!path.some((p) => p.x === c.col && p.y === c.row)) hallway = null
      }
    }

    // Fall back to any hallway under the cursor
    if (!hallway) hallway = this.hitHallway(c.col, c.row, level)
    if (!hallway) {
      // Empty grid — offer paste if clipboard has content
      const pasteItem = this.buildPasteItem(c.col, c.row, c.fx, c.fy)
      if (pasteItem) this.onContextMenu({ screenX: e.clientX, screenY: e.clientY, items: [pasteItem] })
      return
    }

    // Select the hallway if it wasn't already
    if (hallway.id !== selectedId) {
      store.setSelected(hallway.id)
      this.renderer.setSelection(hallway.id)
    }

    const pasteItem = this.buildPasteItem(c.col, c.row, c.fx, c.fy)
    const wpIndex = hallway.waypoints.findIndex((wp) => wp.x === c.col && wp.y === c.row)
    const items: ContextMenuAction[] = [
      ...(pasteItem ? [pasteItem] : []),
      wpIndex !== -1
        ? { kind: 'remove_waypoint', hallwayId: hallway.id, waypointIndex: wpIndex }
        : { kind: 'add_waypoint',    hallwayId: hallway.id, col: c.col, row: c.row },
      { kind: 'delete_hallway', hallwayId: hallway.id },
    ]

    this.onContextMenu({ screenX: e.clientX, screenY: e.clientY, items })
  }

  private action(e: KeyboardEvent, id: import('../store/keyBindings').ActionId): boolean {
    const bindings = useAppSettings.getState().keyBindings[id]
    return bindings?.some((b) => matchesBinding(e, b)) ?? false
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Don't intercept when focus is in an input/textarea
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    const store = this.getStore()
    const ctrl  = e.ctrlKey || e.metaKey

    // copy / cut / paste — not configurable, handled separately
    if (ctrl && e.key === 'c') { e.preventDefault(); this.copy();  return }
    if (ctrl && e.key === 'x') { e.preventDefault(); this.cut();   return }
    if (ctrl && e.key === 'v') { e.preventDefault(); this.paste(); return }

    if (this.action(e, 'undo'))  { e.preventDefault(); this.triggerUndo(); return }
    if (this.action(e, 'redo'))  { e.preventDefault(); this.triggerRedo(); return }
    if (this.action(e, 'fitView')) { e.preventDefault(); this.renderer.fitView(); return }

    if (this.action(e, 'deleteSelected')) {
      const { selectedId, activeLevelId } = store
      if (!selectedId || !activeLevelId) return
      const level = this.getActiveLevel()
      if (!level) return
      const room = level.rooms.find((r) => r.id === selectedId)
      if (room) {
        store.dispatch(new RemoveRoomCommand(activeLevelId, room))
        store.setSelected(null); this.renderer.setSelection(null); return
      }
      const hallway = level.hallways.find((h) => h.id === selectedId)
      if (hallway) {
        store.dispatch(new RemoveHallwayCommand(activeLevelId, hallway))
        store.setSelected(null); this.renderer.setSelection(null); return
      }
      const placement = level.placements.find((p) => p.id === selectedId)
      if (placement) {
        store.dispatch(new RemoveObjectCommand(activeLevelId, placement))
        store.setSelected(null); this.renderer.setSelection(null)
      }
      return
    }

    if (this.action(e, 'toolSelect'))   { this.switchTool('select');       return }
    if (this.action(e, 'toolRoom'))     { this.switchTool('room');         return }
    if (this.action(e, 'toolHallway'))  { this.switchTool('hallway');      return }
    if (this.action(e, 'toolObject'))   { this.switchTool('object');       return }
    if (this.action(e, 'toolPlayer'))   { this.switchTool('player_place'); return }

    if (this.action(e, 'viewLayout'))    { store.setViewMode('layout');    return }
    if (this.action(e, 'viewTextured'))  { store.setViewMode('textured');  return }
    if (this.action(e, 'viewIsometric')) { store.setViewMode('isometric'); return }
    if (this.action(e, 'viewFps'))       { store.setViewMode('fps');       return }

    if (this.action(e, 'cancel')) {
      if (this.state.kind === 'hallway_placing') {
        this.renderer.clearHallwayPreview()
        this.state = { kind: 'idle' }
      }
      if (this.state.kind === 'player_moving') {
        this.renderer.movePlayerPreview(this.state.playerId, this.state.origX, this.state.origY)
        this.state = { kind: 'idle' }
      }
      if (store.activeTool === 'player_place') {
        store.setArmedPlayer(null)
        this.renderer.clearPlayerGhost()
        store.setActiveTool('select')
        this.renderer.setSelection(null)
        return
      }
      if (store.activeTool !== 'select') {
        this.switchTool('select')
      }
      store.setSelected(null)
      this.renderer.setSelection(null)
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

  /** Switch tool, cancelling any in-progress hallway or player placement. */
  private switchTool(tool: import('../store/mapStore').EditorTool): void {
    if (this.state.kind === 'hallway_placing') {
      this.renderer.clearHallwayPreview()
      this.state = { kind: 'idle' }
    }
    const store = this.getStore()
    if (store.activeTool === 'player_place') {
      store.setArmedPlayer(null)
      this.renderer.clearPlayerGhost()
    }
    store.setActiveTool(tool)
    // setActiveTool already clears selectedId in the store; sync the renderer
    this.renderer.setSelection(null)
  }

  /** Called by MapCanvas when the toolbar changes the active tool. */
  cancelCurrentInteraction(): void {
    if (this.state.kind === 'hallway_placing') {
      this.renderer.clearHallwayPreview()
    }
    this.state = { kind: 'idle' }
    this.renderer.setSelection(null)
  }

  private hitHallway(col: number, row: number, level: Level): Hallway | null {
    const hits = this.hitHallwayAll(col, row, level)
    if (hits.length === 0) return null
    // Cycle through overlapping hallways on repeated clicks at the same cell
    const { selectedId } = this.getStore()
    const currentIdx = hits.findIndex((h) => h.id === selectedId)
    return hits[(currentIdx + 1) % hits.length]
  }

  private hitPlacement(fx: number, fy: number, level: Level): ObjectPlacement | null {
    const store = this.getStore()
    const allDefs = [...(store.appCatalog ?? []), ...(store.project?.projectCatalog ?? [])]
    // Iterate in reverse so last-placed is top priority
    for (let i = level.placements.length - 1; i >= 0; i--) {
      const p = level.placements[i]
      const def = allDefs.find((d) => d.id === p.definitionId)
      if (!def) continue
      if (def.kind === 'token') {
        // Circular hit radius of 0.42 (matches the rendered circle)
        const dx = fx - p.x
        const dy = fy - p.y
        if (Math.sqrt(dx * dx + dy * dy) <= 0.5) return p
      } else {
        // Rectangular hit box
        const hw = def.visual.naturalWidth  / 2
        const hh = def.visual.naturalHeight / 2
        if (fx >= p.x - hw && fx <= p.x + hw && fy >= p.y - hh && fy <= p.y + hh) return p
      }
    }
    return null
  }

  private hitHallwayAll(col: number, row: number, level: Level): Hallway[] {
    const hits: Hallway[] = []
    for (const hallway of level.hallways) {
      const roomA = level.rooms.find((r) => r.id === hallway.roomAId)
      const roomB = level.rooms.find((r) => r.id === hallway.roomBId)
      if (!roomA || !roomB) continue
      const path = expandPath(
        computePath(roomA, roomB, hallway.waypoints, hallway.exitA, hallway.exitB),
        hallway.width
      )
      if (path.some((p) => p.x === col && p.y === row)) hits.push(hallway)
    }
    return hits
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
      level.hallways.some((h) => h.id === selectedId) ||
      level.placements.some((p) => p.id === selectedId)
    if (!exists) {
      useMapStore.getState().setSelected(null)
      this.renderer.setSelection(null)
    } else {
      this.renderer.setSelection(selectedId)
    }
  }

  // ── Public undo/redo (called from menu) ──────────────────────────────────────

  triggerUndo(): void {
    const store = this.getStore()
    store.undo()
    const level = this.getActiveLevel()
    if (level) this.renderer.loadLevel(level)
    this.syncSelectionAfterCommand()
  }

  triggerRedo(): void {
    const store = this.getStore()
    store.redo()
    const level = this.getActiveLevel()
    if (level) this.renderer.loadLevel(level)
    this.syncSelectionAfterCommand()
  }

  // ── Public clipboard operations (called from keyboard and menu) ──────────────

  copy(): void {
    const store = this.getStore()
    const { selectedId } = store
    if (!selectedId) return
    const level = this.getActiveLevel()
    if (!level) return

    const room = level.rooms.find((r) => r.id === selectedId)
    if (room) {
      // Copy carries no hallways — the original room still exists with its connections
      store.setClipboard({ kind: 'room', room, hallways: [] })
      return
    }
    const placement = level.placements.find((p) => p.id === selectedId)
    if (placement) { store.setClipboard({ kind: 'placement', placement }) }
    // Hallways: not copyable
  }

  cut(): void {
    const store = this.getStore()
    const { selectedId, activeLevelId } = store
    if (!selectedId || !activeLevelId) return
    const level = this.getActiveLevel()
    if (!level) return

    const room = level.rooms.find((r) => r.id === selectedId)
    if (room) {
      // Capture connected hallways before RemoveRoomCommand strips them
      const hallways = level.hallways.filter(
        (h) => h.roomAId === room.id || h.roomBId === room.id
      )
      store.setClipboard({ kind: 'room', room, hallways })
      store.dispatch(new RemoveRoomCommand(activeLevelId, room))
      store.setSelected(null)
      this.renderer.setSelection(null)
      return
    }
    const placement = level.placements.find((p) => p.id === selectedId)
    if (placement) {
      store.setClipboard({ kind: 'placement', placement })
      store.dispatch(new RemoveObjectCommand(activeLevelId, placement))
      store.setSelected(null)
      this.renderer.setSelection(null)
    }
  }

  paste(): void {
    const store = this.getStore()
    const { clipboard, activeLevelId } = store
    if (!clipboard || !activeLevelId) return

    if (clipboard.kind === 'room') {
      const newId   = crypto.randomUUID()
      const newRoom: Room = {
        ...clipboard.room,
        id: newId,
        x:  clipboard.room.x + 2,
        y:  clipboard.room.y + 2
      }
      store.dispatch(new AddRoomCommand(activeLevelId, newRoom))
      for (const h of clipboard.hallways) {
        store.dispatch(new AddHallwayCommand(activeLevelId, {
          ...h,
          id:      crypto.randomUUID(),
          roomAId: h.roomAId === clipboard.room.id ? newId : h.roomAId,
          roomBId: h.roomBId === clipboard.room.id ? newId : h.roomBId,
        }))
      }
      store.setSelected(newId)
      this.renderer.setSelection(newId)
      return
    }

    if (clipboard.kind === 'placement') {
      const newPlacement: ObjectPlacement = {
        ...clipboard.placement,
        id: crypto.randomUUID(),
        x:  clipboard.placement.x + 1,
        y:  clipboard.placement.y + 1
      }
      store.dispatch(new PlaceObjectCommand(activeLevelId, newPlacement))
      store.setSelected(newPlacement.id)
      this.renderer.setSelection(newPlacement.id)
    }
  }

  /** Paste at a specific grid position (from right-click context menu). */
  pasteAt(col: number, row: number, fx: number, fy: number): void {
    const store = this.getStore()
    const { clipboard, activeLevelId } = store
    if (!clipboard || !activeLevelId) return
    const { w: gw, h: gh } = this.gridBounds()

    if (clipboard.kind === 'room') {
      const r = clipboard.room
      const x = Math.max(0, Math.min(col - Math.floor(r.width  / 2), gw - r.width))
      const y = Math.max(0, Math.min(row - Math.floor(r.height / 2), gh - r.height))
      const newId = crypto.randomUUID()
      const newRoom: Room = { ...r, id: newId, x, y }
      store.dispatch(new AddRoomCommand(activeLevelId, newRoom))
      for (const h of clipboard.hallways) {
        store.dispatch(new AddHallwayCommand(activeLevelId, {
          ...h,
          id:      crypto.randomUUID(),
          roomAId: h.roomAId === r.id ? newId : h.roomAId,
          roomBId: h.roomBId === r.id ? newId : h.roomBId,
        }))
      }
      store.setSelected(newId)
      this.renderer.setSelection(newId)
      return
    }

    if (clipboard.kind === 'placement') {
      const newPlacement: ObjectPlacement = {
        ...clipboard.placement,
        id: crypto.randomUUID(),
        x:  Math.max(0, Math.min(fx, gw)),
        y:  Math.max(0, Math.min(fy, gh)),
      }
      store.dispatch(new PlaceObjectCommand(activeLevelId, newPlacement))
      store.setSelected(newPlacement.id)
      this.renderer.setSelection(newPlacement.id)
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('mousedown',   this._onMousedown)
    this.canvas.removeEventListener('mousemove',   this._onMousemove)
    this.canvas.removeEventListener('mouseup',     this._onMouseup)
    this.canvas.removeEventListener('mouseleave',  this._onMouseleave)
    this.canvas.removeEventListener('contextmenu', this._onContextMenu)
    window.removeEventListener('keydown',          this._onKeydown)
  }
}
