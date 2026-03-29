import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { Level, Room, Hallway, SurfaceSettings, FloorMaterial, WallMaterial } from '../types/map'
import { computePath, resolveExitPoints } from './hallwayPath'

export type ViewMode = 'topdown' | 'isometric' | 'fps'

// ── Constants ──────────────────────────────────────────────────────────────────

const CELL_SIZE   = 1
const WALL_HEIGHT = 1.5
const WALL_DEPTH  = 0.15

const FLOOR_COLORS: Record<FloorMaterial, number> = {
  stone: 0x4a3f35,
  wood:  0x6b4c1e,
  dirt:  0x5a4a32,
  water: 0x1a6b8a,
  lava:  0xcc3300,
  pit:   0x0d0d0d
}

const WALL_COLORS: Record<WallMaterial, number> = {
  stone: 0x6b6b6b,
  wood:  0x7b5a2a,
  brick: 0x8b4a3a,
  cave:  0x4a4a4a
}

const SELECTION_COLOR = 0xf5c842
const HOVER_COLOR     = 0xffffff
const GHOST_COLOR       = 0x7b5eea
const HALLWAY_PREVIEW   = 0x5eea9a
const ENDPOINT_COLOR    = 0x4dd9ac   // teal — hallway endpoint handles

// ── Types ──────────────────────────────────────────────────────────────────────

export type ResizeHandle = 'TL' | 'T' | 'TR' | 'R' | 'BR' | 'B' | 'BL' | 'L'

export interface HandleHit {
  handle:    ResizeHandle
  roomId:    string
}

// ── Renderer ───────────────────────────────────────────────────────────────────

export class MapRenderer {
  private canvas:        HTMLCanvasElement
  private renderer:      THREE.WebGLRenderer
  private scene:         THREE.Scene
  private camera:        THREE.Camera
  private orbitControls: OrbitControls | null = null
  private fpsControls:   PointerLockControls | null = null
  private animationId:   number | null = null
  private viewMode:      ViewMode = 'topdown'

  // Render groups
  private mapGroup:       THREE.Group
  private wallGroup:      THREE.Group
  private gridGroup:      THREE.Group
  private selectionGroup: THREE.Group
  private overlayGroup:   THREE.Group  // ghost, move-preview, endpoint-preview
  private hoverGroup:     THREE.Group  // rebuilt each setHover call

  // Overlay meshes (pre-created, repositioned on demand)
  private hoverRoomMesh:   THREE.Mesh   // reusable single quad for room hover
  private ghostMesh:          THREE.Mesh
  private movePreviewMesh:    THREE.Mesh
  private endpointPreviewMesh: THREE.Mesh

  // Current level reference for overlay positioning
  private currentLevel: Level | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas   = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setClearColor(0x4a4a4a)

    this.scene  = new THREE.Scene()
    this.camera = this.createTopDownCamera()

    this.mapGroup       = new THREE.Group()
    this.wallGroup      = new THREE.Group()
    this.gridGroup      = new THREE.Group()
    this.selectionGroup = new THREE.Group()
    this.overlayGroup   = new THREE.Group()
    this.hoverGroup     = new THREE.Group()

    this.scene.add(this.mapGroup, this.wallGroup, this.gridGroup, this.selectionGroup, this.hoverGroup, this.overlayGroup)

    // Pre-create overlay meshes (scaled on demand)
    this.hoverRoomMesh        = this.makeFlatQuad(HOVER_COLOR,     0.12)
    this.ghostMesh            = this.makeFlatQuad(GHOST_COLOR,     0.45)
    this.movePreviewMesh      = this.makeFlatQuad(SELECTION_COLOR, 0.25)
    this.endpointPreviewMesh  = this.makeFlatQuad(ENDPOINT_COLOR,  0.55)

    this.hoverRoomMesh.renderOrder        = 1
    this.hoverGroup.add(this.hoverRoomMesh)
    this.ghostMesh.renderOrder            = 2
    this.movePreviewMesh.renderOrder      = 2
    this.endpointPreviewMesh.renderOrder  = 11

    this.overlayGroup.add(
      this.ghostMesh,
      this.movePreviewMesh, this.endpointPreviewMesh
    )

    this.setupLights()
    this.startLoop()
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  private makeFlatQuad(color: number, opacity: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.visible = false
    return mesh
  }

  private positionFlatQuad(
    mesh: THREE.Mesh,
    x: number, y: number, w: number, h: number,
    elevation = 0.008
  ): void {
    mesh.scale.set(w * CELL_SIZE, 1, h * CELL_SIZE)
    mesh.position.set(
      (x + w / 2) * CELL_SIZE,
      elevation,
      (y + h / 2) * CELL_SIZE
    )
    mesh.visible = true
  }

  private setupLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const dir = new THREE.DirectionalLight(0xfff5cc, 0.9)
    dir.position.set(10, 20, 10)
    this.scene.add(dir)
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat.dispose()
    })
    group.clear()
  }

  // ── Camera factories ─────────────────────────────────────────────────────────

  private createTopDownCamera(cx = 24, cz = 24): THREE.OrthographicCamera {
    const aspect = this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1)
    const size   = 24
    const cam    = new THREE.OrthographicCamera(
      -size * aspect, size * aspect, size, -size, 0.1, 1000
    )
    cam.position.set(cx, 100, cz)
    cam.lookAt(cx, 0, cz)
    cam.up.set(0, 0, -1)
    return cam
  }

  private createIsometricCamera(gridW: number, gridH: number): THREE.OrthographicCamera {
    const aspect = this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1)
    const size   = Math.max(gridW, gridH) * 0.75
    const cx     = (gridW * CELL_SIZE) / 2
    const cz     = (gridH * CELL_SIZE) / 2
    const cam    = new THREE.OrthographicCamera(
      -size * aspect, size * aspect, size, -size, 0.1, 2000
    )
    cam.position.set(cx + 20, 20, cz + 20)
    cam.lookAt(cx, 0, cz)
    return cam
  }

  private createFPSCamera(): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(
      75, this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1), 0.1, 500
    )
    cam.position.set(4, 1, 4)
    return cam
  }

  // ── View mode ─────────────────────────────────────────────────────────────────

  setViewMode(mode: ViewMode, gridWidth = 48, gridHeight = 48): void {
    this.viewMode = mode
    this.orbitControls?.dispose()
    this.fpsControls?.dispose()
    this.orbitControls = null
    this.fpsControls   = null

    const cx = (gridWidth  * CELL_SIZE) / 2
    const cz = (gridHeight * CELL_SIZE) / 2

    switch (mode) {
      case 'topdown': {
        this.camera = this.createTopDownCamera(cx, cz)
        const oc = new OrbitControls(this.camera, this.canvas)
        oc.enableRotate = false
        oc.target.set(cx, 0, cz)
        oc.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
        oc.update()
        this.orbitControls = oc
        break
      }
      case 'isometric': {
        this.camera = this.createIsometricCamera(gridWidth, gridHeight)
        const oc = new OrbitControls(this.camera, this.canvas)
        oc.enableRotate = false
        oc.target.set(cx, 0, cz)
        oc.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
        oc.update()
        this.orbitControls = oc
        break
      }
      case 'fps': {
        this.camera      = this.createFPSCamera()
        this.fpsControls = new PointerLockControls(this.camera, this.canvas)
        this.canvas.addEventListener('click', () => this.fpsControls?.lock(), { once: true })
        break
      }
    }
  }

  // ── Level rendering ───────────────────────────────────────────────────────────

  loadLevel(level: Level): void {
    this.currentLevel = level
    this.disposeGroup(this.mapGroup)
    this.disposeGroup(this.wallGroup)
    this.disposeGroup(this.gridGroup)
    this.selectionGroup.clear()  // selection is invalidated on full reload

    const { gridWidth, gridHeight, wallMaterial } = level.settings
    const wallColor = WALL_COLORS[wallMaterial]

    // Build a global floor set for wall adjacency queries
    const floorSet = new Set<string>()

    // ── Rooms ──
    for (const room of level.rooms) {
      this.renderRoomFloor(room, level.settings)
      for (let row = room.y; row < room.y + room.height; row++) {
        for (let col = room.x; col < room.x + room.width; col++) {
          floorSet.add(`${col},${row}`)
        }
      }
    }

    // ── Hallways ──
    for (const hallway of level.hallways) {
      const roomA = level.rooms.find((r) => r.id === hallway.roomAId)
      const roomB = level.rooms.find((r) => r.id === hallway.roomBId)
      if (!roomA || !roomB) continue

      const path     = computePath(roomA, roomB, hallway.waypoints, hallway.exitA, hallway.exitB)
      const material = hallway.settings.floorMaterial ?? level.settings.floorMaterial
      const color    = FLOOR_COLORS[material]

      const corridorCells = path.filter((c) => !floorSet.has(`${c.x},${c.y}`))
      for (const c of corridorCells) floorSet.add(`${c.x},${c.y}`)

      if (corridorCells.length === 0) continue

      // Render hallway cells as a merged vertex-colored geometry
      const positions: number[] = []
      const colors:    number[] = []
      const indices:   number[] = []
      let vi = 0

      const r = ((color >> 16) & 0xff) / 255
      const g = ((color >> 8)  & 0xff) / 255
      const b = (color & 0xff)          / 255

      for (const cell of corridorCells) {
        const px = cell.x * CELL_SIZE
        const pz = cell.y * CELL_SIZE
        const base = vi
        positions.push(px, 0, pz, px + CELL_SIZE, 0, pz, px, 0, pz + CELL_SIZE, px + CELL_SIZE, 0, pz + CELL_SIZE)
        for (let v = 0; v < 4; v++) colors.push(r, g, b)
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
        vi += 4
      }

      if (positions.length > 0) {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3))
        geo.setIndex(indices)
        geo.computeVertexNormals()
        this.mapGroup.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })))
      }
    }

    // ── Walls (edge-based) ──
    const wallMatNS = new THREE.MeshLambertMaterial({ color: wallColor })
    const wallMatEW = new THREE.MeshLambertMaterial({ color: wallColor })

    for (const key of floorSet) {
      const [col, row] = key.split(',').map(Number)

      // North edge: row - 1 not floor
      if (!floorSet.has(`${col},${row - 1}`)) {
        const geo  = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, WALL_DEPTH)
        const mesh = new THREE.Mesh(geo, wallMatNS)
        mesh.position.set((col + 0.5) * CELL_SIZE, WALL_HEIGHT / 2, row * CELL_SIZE)
        this.wallGroup.add(mesh)
      }
      // South edge
      if (!floorSet.has(`${col},${row + 1}`)) {
        const geo  = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, WALL_DEPTH)
        const mesh = new THREE.Mesh(geo, wallMatNS)
        mesh.position.set((col + 0.5) * CELL_SIZE, WALL_HEIGHT / 2, (row + 1) * CELL_SIZE)
        this.wallGroup.add(mesh)
      }
      // West edge
      if (!floorSet.has(`${col - 1},${row}`)) {
        const geo  = new THREE.BoxGeometry(WALL_DEPTH, WALL_HEIGHT, CELL_SIZE)
        const mesh = new THREE.Mesh(geo, wallMatEW)
        mesh.position.set(col * CELL_SIZE, WALL_HEIGHT / 2, (row + 0.5) * CELL_SIZE)
        this.wallGroup.add(mesh)
      }
      // East edge
      if (!floorSet.has(`${col + 1},${row}`)) {
        const geo  = new THREE.BoxGeometry(WALL_DEPTH, WALL_HEIGHT, CELL_SIZE)
        const mesh = new THREE.Mesh(geo, wallMatEW)
        mesh.position.set((col + 1) * CELL_SIZE, WALL_HEIGHT / 2, (row + 0.5) * CELL_SIZE)
        this.wallGroup.add(mesh)
      }
    }

    // ── Grid overlay ──
    const gridGeo = new THREE.PlaneGeometry(gridWidth * CELL_SIZE, gridHeight * CELL_SIZE)
    const gridMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite:  false,
      uniforms: { uGridSize: { value: new THREE.Vector2(gridWidth, gridHeight) } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec2 uGridSize;
        void main() {
          vec2 coord = vUv * uGridSize;
          vec2 grid  = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
          float line  = min(grid.x, grid.y);
          float alpha = (1.0 - smoothstep(0.0, 1.2, line)) * 0.85;
          gl_FragColor = vec4(0.78, 0.78, 0.78, alpha);
        }
      `
    })
    const gridPlane = new THREE.Mesh(gridGeo, gridMat)
    gridPlane.rotation.x = -Math.PI / 2
    gridPlane.position.set(gridWidth * CELL_SIZE / 2, 0.01, gridHeight * CELL_SIZE / 2)
    this.gridGroup.add(gridPlane)
  }

  private renderRoomFloor(room: Room, defaults: SurfaceSettings): void {
    const material = room.settings.floorMaterial ?? defaults.floorMaterial
    const color    = FLOOR_COLORS[material]
    const r = ((color >> 16) & 0xff) / 255
    const g = ((color >> 8)  & 0xff) / 255
    const b = (color & 0xff)          / 255

    const positions: number[] = []
    const colors:    number[] = []
    const indices:   number[] = []
    let vi = 0

    for (let row = room.y; row < room.y + room.height; row++) {
      for (let col = room.x; col < room.x + room.width; col++) {
        const px   = col * CELL_SIZE
        const pz   = row * CELL_SIZE
        const base = vi
        positions.push(px, 0, pz, px + CELL_SIZE, 0, pz, px, 0, pz + CELL_SIZE, px + CELL_SIZE, 0, pz + CELL_SIZE)
        for (let v = 0; v < 4; v++) colors.push(r, g, b)
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
        vi += 4
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
    mesh.userData['roomId'] = room.id
    this.mapGroup.add(mesh)
  }

  // ── Hover / Selection / Ghost overlays ──────────────────────────────────────

  setHover(id: string | null): void {
    // Clear previous hover — remove any hallway cell quads, hide room quad
    this.hoverRoomMesh.visible = false
    for (let i = this.hoverGroup.children.length - 1; i >= 0; i--) {
      const child = this.hoverGroup.children[i]
      if (child !== this.hoverRoomMesh) {
        this.hoverGroup.remove(child)
        const m = child as THREE.Mesh
        m.geometry.dispose()
      }
    }

    if (!id || !this.currentLevel) return

    const room = this.currentLevel.rooms.find((r) => r.id === id)
    if (room) {
      this.positionFlatQuad(this.hoverRoomMesh, room.x, room.y, room.width, room.height, 0.004)
      return
    }

    const hallway = this.currentLevel.hallways.find((h) => h.id === id)
    if (hallway) {
      this.highlightHallwayCells(this.hoverGroup, hallway, HOVER_COLOR, 0.14, 0.004)
    }
  }

  setSelection(id: string | null): void {
    this.disposeGroup(this.selectionGroup)
    if (!id || !this.currentLevel) return

    // ── Room selection ──
    const room = this.currentLevel.rooms.find((r) => r.id === id)
    if (room) {
      const highlight = this.makeFlatQuad(SELECTION_COLOR, 0.18)
      this.positionFlatQuad(highlight, room.x, room.y, room.width, room.height, 0.006)
      highlight.visible = true
      this.selectionGroup.add(highlight)

      const hw = room.width  / 2
      const hh = room.height / 2
      const handleDefs = [
        { x: room.x,               y: room.y },
        { x: room.x + hw,          y: room.y },
        { x: room.x + room.width,  y: room.y },
        { x: room.x + room.width,  y: room.y + hh },
        { x: room.x + room.width,  y: room.y + room.height },
        { x: room.x + hw,          y: room.y + room.height },
        { x: room.x,               y: room.y + room.height },
        { x: room.x,               y: room.y + hh }
      ]
      const handleGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28)
      const handleMat = new THREE.MeshBasicMaterial({ color: SELECTION_COLOR, depthTest: false })
      for (const def of handleDefs) {
        const mesh = new THREE.Mesh(handleGeo, handleMat)
        mesh.position.set(def.x * CELL_SIZE, 0.14, def.y * CELL_SIZE)
        mesh.renderOrder = 10
        this.selectionGroup.add(mesh)
      }
      return
    }

    // ── Hallway selection ──
    const hallway = this.currentLevel.hallways.find((h) => h.id === id)
    if (hallway) {
      this.highlightHallwayCells(this.selectionGroup, hallway, SELECTION_COLOR, 0.35, 0.006)

      // Endpoint handles
      const roomA = this.currentLevel.rooms.find((r) => r.id === hallway.roomAId)
      const roomB = this.currentLevel.rooms.find((r) => r.id === hallway.roomBId)
      if (roomA && roomB) {
        const { start, end } = resolveExitPoints(
          roomA, roomB, hallway.waypoints, hallway.exitA, hallway.exitB
        )
        const handleGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55)
        const handleMat = new THREE.MeshBasicMaterial({ color: ENDPOINT_COLOR, depthTest: false })
        for (const pt of [start, end]) {
          const mesh = new THREE.Mesh(handleGeo, handleMat)
          mesh.position.set((pt.x + 0.5) * CELL_SIZE, 0.28, (pt.y + 0.5) * CELL_SIZE)
          mesh.renderOrder = 10
          this.selectionGroup.add(mesh)
        }
      }
    }
  }

  /**
   * Highlights each cell of a hallway's computed path with per-cell flat quads.
   * Uses depthTest:false so they always render above floor and wall geometry.
   */
  private highlightHallwayCells(
    target:    THREE.Group,
    hallway:   Hallway,
    color:     number,
    opacity:   number,
    elevation: number
  ): void {
    const level = this.currentLevel
    if (!level) return
    const roomA = level.rooms.find((r) => r.id === hallway.roomAId)
    const roomB = level.rooms.find((r) => r.id === hallway.roomBId)
    if (!roomA || !roomB) return

    const path = computePath(roomA, roomB, hallway.waypoints, hallway.exitA, hallway.exitB)
    if (path.length === 0) return

    const geo = new THREE.PlaneGeometry(CELL_SIZE * 0.92, CELL_SIZE * 0.92)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest:  false,
      depthWrite: false
    })

    for (const cell of path) {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set((cell.x + 0.5) * CELL_SIZE, elevation, (cell.y + 0.5) * CELL_SIZE)
      mesh.renderOrder = 4
      target.add(mesh)
    }
  }

  setGhostRoom(x: number, y: number, w: number, h: number): void {
    this.positionFlatQuad(this.ghostMesh, x, y, Math.max(w, 1), Math.max(h, 1), 0.012)
  }

  clearGhost(): void {
    this.ghostMesh.visible = false
  }

  setMovePreview(roomId: string, newX: number, newY: number): void {
    const room = this.currentLevel?.rooms.find((r) => r.id === roomId)
    if (!room) return
    this.positionFlatQuad(this.movePreviewMesh, newX, newY, room.width, room.height, 0.01)
  }

  clearMovePreview(): void {
    this.movePreviewMesh.visible = false
  }

  /** Shows a teal cell-sized marker at the snapped endpoint position during drag. */
  setEndpointPreview(cell: { x: number; y: number }): void {
    this.positionFlatQuad(this.endpointPreviewMesh, cell.x, cell.y, 1, 1, 0.015)
  }

  clearEndpointPreview(): void {
    this.endpointPreviewMesh.visible = false
  }

  /** Show a preview for an in-progress hallway (first room selected, cursor position) */
  setHallwayPreview(roomAId: string, cursorCol: number, cursorRow: number): void {
    const room = this.currentLevel?.rooms.find((r) => r.id === roomAId)
    if (!room) return
    // Tint room A with hallway preview color
    const existing = this.mapGroup.children.find(
      (c) => c.userData['roomId'] === roomAId
    ) as THREE.Mesh | undefined
    if (existing && !Array.isArray(existing.material)) {
      (existing.material as THREE.MeshLambertMaterial).emissive.setHex(HALLWAY_PREVIEW)
      (existing.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.3
    }
    // Show ghost cursor at current position
    this.positionFlatQuad(this.ghostMesh, cursorCol - 0.5, cursorRow - 0.5, 1, 1, 0.012)
  }

  clearHallwayPreview(): void {
    this.ghostMesh.visible = false
    // Reset any room tinting
    for (const child of this.mapGroup.children) {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) continue
      const mat = mesh.material as THREE.MeshLambertMaterial
      if (mat.emissive) mat.emissive.setHex(0x000000)
    }
  }

  // ── Coordinate conversion (used by InputManager) ──────────────────────────

  /**
   * Returns both the integer grid cell (for room/hallway hit testing)
   * and the raw floating-point grid position (for handle hit testing,
   * where handles sit exactly on cell boundaries).
   */
  worldToGrid(clientX: number, clientY: number): { col: number; row: number; fx: number; fy: number } | null {
    if (this.viewMode === 'fps') return null
    const rect   = this.canvas.getBoundingClientRect()
    const mouse  = new THREE.Vector2(
      ((clientX - rect.left) / rect.width)  * 2 - 1,
      -((clientY - rect.top)  / rect.height) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, this.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const point = new THREE.Vector3()
    if (!raycaster.ray.intersectPlane(plane, point)) return null
    const fx = point.x / CELL_SIZE
    const fy = point.z / CELL_SIZE
    return { col: Math.floor(fx), row: Math.floor(fy), fx, fy }
  }

  // ── Resize ────────────────────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    const aspect = width / Math.max(height, 1)

    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = aspect
      this.camera.updateProjectionMatrix()
    } else if (this.camera instanceof THREE.OrthographicCamera) {
      const size = 24
      this.camera.left   = -size * aspect
      this.camera.right  =  size * aspect
      this.camera.top    =  size
      this.camera.bottom = -size
      this.camera.updateProjectionMatrix()
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────────

  private startLoop(): void {
    const animate = (): void => {
      this.animationId = requestAnimationFrame(animate)
      this.orbitControls?.update()
      this.renderer.render(this.scene, this.camera)
    }
    animate()
  }

  dispose(): void {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId)
    this.orbitControls?.dispose()
    this.fpsControls?.dispose()
    this.disposeGroup(this.mapGroup)
    this.disposeGroup(this.wallGroup)
    this.disposeGroup(this.gridGroup)
    this.disposeGroup(this.selectionGroup)
    this.disposeGroup(this.hoverGroup)
    this.renderer.dispose()
  }
}
