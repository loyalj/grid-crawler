import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { Level, Room, Hallway, SurfaceSettings, ObjectDefinition, TokenDefinition, PropDefinition, Player, TextureDefinition } from '../types/map'
import { computePath, expandPath, resolveExitPoints } from './hallwayPath'

export type ViewMode = 'layout' | 'textured' | 'isometric' | 'fps'

// ── Constants ──────────────────────────────────────────────────────────────────

const CELL_SIZE            = 1
const WALL_HEIGHT_PER_UNIT = 1.0    // world-space height per ceilingHeight unit = 1 grid unit = 5 ft
const WALL_DEPTH           = 0.15

/** Fallback layout color when a floor material ID isn't in the catalog. */
const FALLBACK_FLOOR_COLOR = 0x4a3f35

const FALLBACK_WALL_COLOR = 0x6b6b6b

const SELECTION_COLOR = 0x2dd4bf
const HOVER_COLOR     = 0xffffff
const GHOST_COLOR       = 0x7b5eea
const HALLWAY_PREVIEW   = 0x5eea9a
const ENDPOINT_COLOR    = 0x4dd9ac   // teal — hallway endpoint handles
const WAYPOINT_COLOR    = 0xff8c42   // orange — hallway waypoint handles

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
  private orbitControls:  OrbitControls | null = null
  private fpsControls:    PointerLockControls | null = null
  private fpsKeys:        Set<string> = new Set()
  private fpsWalkable:    Set<string> = new Set()  // "col,row" cells passable in FPS
  private _onFpsKeydown:  ((e: KeyboardEvent) => void) | null = null
  private _onFpsKeyup:    ((e: KeyboardEvent) => void) | null = null
  private _onFpsClick:    (() => void) | null = null
  private animationId:    number | null = null

  // Render groups
  private mapGroup:       THREE.Group
  private wallGroup:      THREE.Group
  private gridGroup:      THREE.Group
  private objectsGroup:   THREE.Group
  private selectionGroup: THREE.Group
  private overlayGroup:   THREE.Group  // ghost, move-preview, endpoint-preview
  private hoverGroup:     THREE.Group  // rebuilt each setHover call
  private labelsGroup:    THREE.Group  // room label sprites
  private playersGroup:   THREE.Group  // player tokens

  // Catalog reference for object rendering
  private catalog: ObjectDefinition[] = []
  // Pre-loaded THREE.Texture instances keyed by ObjectDefinition.id (props only)
  private propTextureCache = new Map<string, THREE.Texture>()

  // Unified texture catalog (app + project combined)
  private textureCatalog: TextureDefinition[] = []
  // Pre-loaded THREE.Texture instances keyed by TextureDefinition.id
  private textureCache = new Map<string, THREE.Texture>()
  // Current view mode
  private viewMode: ViewMode = 'layout'

  // Players reference (project-level; updated via setPlayers)
  private players: Player[] = []
  // Map from playerId → THREE.Group so we can reposition during drag
  private playerMeshMap = new Map<string, THREE.Group>()

  // Placement ghost (follows cursor when object tool is armed)
  private placementGhostGroup: THREE.Group
  // Player placement ghost (follows cursor when player_place tool is armed)
  private playerGhostGroup: THREE.Group

  // Overlay meshes (pre-created, repositioned on demand)
  private hoverRoomMesh:   THREE.Mesh   // reusable single quad for room hover
  private ghostMesh:          THREE.Mesh
  private movePreviewMesh:    THREE.Mesh
  private endpointPreviewMesh: THREE.Mesh

  // Current level reference for overlay positioning
  private currentLevel: Level | null = null

  // App settings — persisted across loadLevel calls
  private gridSettings = { visible: true, color: '#c8c8c8', opacity: 0.85 }
  private gridMaterial: THREE.ShaderMaterial | null = null

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
    this.objectsGroup   = new THREE.Group()
    this.selectionGroup = new THREE.Group()
    this.overlayGroup   = new THREE.Group()
    this.hoverGroup     = new THREE.Group()
    this.labelsGroup    = new THREE.Group()
    this.playersGroup   = new THREE.Group()

    this.placementGhostGroup = new THREE.Group()
    this.placementGhostGroup.visible = false

    this.playerGhostGroup = new THREE.Group()
    this.playerGhostGroup.visible = false

    this.scene.add(this.mapGroup, this.wallGroup, this.gridGroup, this.objectsGroup, this.selectionGroup, this.hoverGroup, this.overlayGroup, this.labelsGroup, this.playersGroup, this.placementGhostGroup, this.playerGhostGroup)

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

  private createFPSCamera(spawnX = 4, spawnZ = 4): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(
      75, this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1), 0.1, 500
    )
    cam.position.set(spawnX, 1.2, spawnZ)
    return cam
  }

  // ── View mode ─────────────────────────────────────────────────────────────────

  setViewMode(mode: ViewMode, spawnX?: number, spawnZ?: number): void {
    this.viewMode = mode

    // Tear down previous controls and WASD listeners
    this.orbitControls?.dispose()
    this.fpsControls?.dispose()
    this.orbitControls = null
    this.fpsControls   = null
    if (this._onFpsKeydown) { window.removeEventListener('keydown', this._onFpsKeydown); this._onFpsKeydown = null }
    if (this._onFpsKeyup)   { window.removeEventListener('keyup',   this._onFpsKeyup);   this._onFpsKeyup   = null }
    if (this._onFpsClick)   { this.canvas.removeEventListener('click', this._onFpsClick); this._onFpsClick   = null }
    this.fpsKeys.clear()

    const gridWidth  = this.currentLevel?.settings.gridWidth  ?? 48
    const gridHeight = this.currentLevel?.settings.gridHeight ?? 48
    const cx = (gridWidth  * CELL_SIZE) / 2
    const cz = (gridHeight * CELL_SIZE) / 2

    switch (mode) {
      case 'layout':
      case 'textured': {
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
        const sx = spawnX ?? cx
        const sz = spawnZ ?? cz
        this.camera      = this.createFPSCamera(sx, sz)
        this.fpsControls = new PointerLockControls(this.camera, this.canvas)
        this._onFpsClick = () => { if (!this.fpsControls?.isLocked) this.fpsControls?.lock() }
        this.canvas.addEventListener('click', this._onFpsClick)

        // WASD key tracking
        this._onFpsKeydown = (e: KeyboardEvent) => {
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
          this.fpsKeys.add(e.code)
        }
        this._onFpsKeyup = (e: KeyboardEvent) => { this.fpsKeys.delete(e.code) }
        window.addEventListener('keydown', this._onFpsKeydown)
        window.addEventListener('keyup',   this._onFpsKeyup)
        break
      }
    }

    if (this.currentLevel) this.loadLevel(this.currentLevel)
  }

  // ── Fit view ──────────────────────────────────────────────────────────────────

  isFpsPointerLocked(): boolean {
    return this.fpsControls?.isLocked ?? false
  }

  fitView(): void {
    if (this.viewMode === 'fps' || !this.orbitControls) return

    const level = this.currentLevel
    const gridW = level?.settings.gridWidth  ?? 48
    const gridH = level?.settings.gridHeight ?? 48

    // Compute bounding box of all rooms; fall back to full grid
    let minX = 0, minZ = 0, maxX = gridW, maxZ = gridH
    if (level && level.rooms.length > 0) {
      minX = Infinity; minZ = Infinity; maxX = -Infinity; maxZ = -Infinity
      for (const r of level.rooms) {
        minX = Math.min(minX, r.x)
        minZ = Math.min(minZ, r.y)
        maxX = Math.max(maxX, r.x + r.width)
        maxZ = Math.max(maxZ, r.y + r.height)
      }
    }

    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const boundsW = maxX - minX
    const boundsH = maxZ - minZ

    // Reposition camera keeping its angular offset from the target
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.orbitControls.target)
    this.orbitControls.target.set(cx, 0, cz)
    this.camera.position.copy(this.orbitControls.target).add(offset)

    // Fit zoom for orthographic cameras
    if ((this.camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const cam    = this.camera as THREE.OrthographicCamera
      const aspect = this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1)
      const PADDING = 1.15
      const zoomH = (cam.top - cam.bottom) / 2 / (boundsH / 2 * PADDING)
      const zoomW = (cam.right - cam.left) / 2 / aspect / (boundsW / 2 * PADDING)
      cam.zoom = Math.min(zoomH, zoomW)
      cam.updateProjectionMatrix()
    }

    this.orbitControls.update()
  }

  // ── Level rendering ───────────────────────────────────────────────────────────

  setCatalog(catalog: ObjectDefinition[]): void {
    this.catalog = catalog

    // Dispose textures for definitions no longer in catalog
    const incomingIds = new Set(catalog.map((d) => d.id))
    for (const [id, tex] of this.propTextureCache) {
      if (!incomingIds.has(id)) { tex.dispose(); this.propTextureCache.delete(id) }
    }

    // Pre-load textures for props that have a textureUrl
    const loader = new THREE.TextureLoader()
    for (const def of catalog) {
      if (def.kind !== 'prop') continue
      if (this.propTextureCache.has(def.id)) continue
      const url = (def as PropDefinition).visual.textureUrl
      if (!url) continue
      const tex = loader.load(url, () => { tex.needsUpdate = true })
      this.propTextureCache.set(def.id, tex)
    }
  }

  /** Update the unified texture catalog and pre-load all textures. */
  setTextureCatalog(defs: TextureDefinition[]): void {
    this.textureCatalog = defs

    const incomingIds = new Set(defs.map((d) => d.id))
    for (const [id, tex] of this.textureCache) {
      if (!incomingIds.has(id)) { tex.dispose(); this.textureCache.delete(id) }
    }

    const loader = new THREE.TextureLoader()
    for (const def of defs) {
      if (this.textureCache.has(def.id)) continue
      if (!def.textureUrl) continue
      const tex = loader.load(def.textureUrl, () => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.needsUpdate = true
      })
      this.textureCache.set(def.id, tex)
    }
  }

  loadLevel(level: Level): void {
    this.currentLevel = level
    this.disposeGroup(this.mapGroup)
    this.disposeGroup(this.wallGroup)
    this.disposeGroup(this.gridGroup)
    this.disposeGroup(this.objectsGroup)
    this.disposeGroup(this.labelsGroup)
    this.disposeGroup(this.playersGroup)
    this.playerMeshMap.clear()
    // Preserve the player selection outline across reloads
    const playerSel = this.selectionGroup.getObjectByName('player_sel')
    if (playerSel) this.selectionGroup.remove(playerSel)
    this.selectionGroup.clear()
    if (playerSel) this.selectionGroup.add(playerSel)

    const { gridWidth, gridHeight, wallMaterial, ceilingHeight: levelCeilH } = level.settings

    // Build a global floor set for wall adjacency queries, plus per-cell maps
    // for wall material and ceiling height so each segment uses its owner's settings.
    const floorSet       = new Set<string>()
    const cellWallMat    = new Map<string, WallMaterial>()
    const cellCeilHeight = new Map<string, number>()

    // ── Rooms ──
    // roomIndex 0 = top of nav = highest priority (wins Z-fights with rooms below it)
    for (let roomIndex = 0; roomIndex < level.rooms.length; roomIndex++) {
      const room = level.rooms[roomIndex]
      this.renderRoomFloor(room, level.settings, roomIndex, level.rooms.length)
      const mat    = (room.settings.wallMaterial  ?? wallMaterial) as WallMaterial
      const ceilH  = room.settings.ceilingHeight  ?? levelCeilH
      for (let row = room.y; row < room.y + room.height; row++) {
        for (let col = room.x; col < room.x + room.width; col++) {
          const key = `${col},${row}`
          floorSet.add(key)
          cellWallMat.set(key, mat)
          cellCeilHeight.set(key, ceilH)
        }
      }
    }

    // ── Hallways ──
    for (const hallway of level.hallways) {
      const roomA = level.rooms.find((r) => r.id === hallway.roomAId)
      const roomB = level.rooms.find((r) => r.id === hallway.roomBId)
      if (!roomA || !roomB) continue

      const centerline   = computePath(roomA, roomB, hallway.waypoints, hallway.exitA, hallway.exitB)
      const path         = expandPath(centerline, hallway.width)
      const materialId   = hallway.settings.floorMaterial ?? level.settings.floorMaterial
      const color        = this.getLayoutColor(materialId)

      const hallwayWallMat = (hallway.settings.wallMaterial  ?? wallMaterial) as WallMaterial
      const hallwayCeilH   =  hallway.settings.ceilingHeight ?? levelCeilH
      const corridorCells = path.filter((c) => !floorSet.has(`${c.x},${c.y}`))
      for (const c of corridorCells) {
        const key = `${c.x},${c.y}`
        floorSet.add(key)
        cellWallMat.set(key, hallwayWallMat)
        cellCeilHeight.set(key, hallwayCeilH)
      }

      if (corridorCells.length === 0) continue

      const positions: number[] = []
      const colors:    number[] = []
      const uvs:       number[] = []
      const indices:   number[] = []
      let vi = 0

      const r = ((color >> 16) & 0xff) / 255
      const g = ((color >> 8)  & 0xff) / 255
      const b = (color & 0xff)          / 255

      const def      = this.getTextureDef(materialId)
      const tileSize = def?.tileSize ?? 2

      for (const cell of corridorCells) {
        const px = cell.x * CELL_SIZE
        const pz = cell.y * CELL_SIZE
        const base = vi
        positions.push(
          px,             0, pz,
          px + CELL_SIZE, 0, pz,
          px,             0, pz + CELL_SIZE,
          px + CELL_SIZE, 0, pz + CELL_SIZE,
        )
        for (let v = 0; v < 4; v++) colors.push(r, g, b)
        // World-space UVs so texture tiles continuously and aligns with room floors
        const u0 = cell.x / tileSize
        const u1 = (cell.x + 1) / tileSize
        const v0 = cell.y / tileSize
        const v1 = (cell.y + 1) / tileSize
        uvs.push(u0, v0,  u1, v0,  u0, v1,  u1, v1)
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
        vi += 4
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3))
      geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,       2))
      geo.setIndex(indices)
      geo.computeVertexNormals()

      const hallwayDef = this.viewMode !== 'layout' ? this.getTextureDef(materialId) : null
      const hallwayTex = hallwayDef ? this.textureCache.get(materialId) : undefined
      let hallwayMat: THREE.Material
      if (hallwayTex && hallwayDef) {
        const t = hallwayTex.clone()
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        this.applyTextureTransform(t, hallwayDef)
        t.needsUpdate = true
        hallwayMat = new THREE.MeshStandardMaterial({ map: t })
      } else {
        hallwayMat = new THREE.MeshLambertMaterial({ vertexColors: true })
      }
      this.mapGroup.add(new THREE.Mesh(geo, hallwayMat))
    }

    // Persist walkable set for FPS collision
    this.fpsWalkable = new Set(floorSet)

    // ── Walls (edge-based) ──
    // Materials are keyed by "mat-wallH" (at most 4 mats × 4 heights = 16 combos).
    const builtWallMats = new Map<string, THREE.Material>()
    const getWallMat = (mat: string, wallH: number): THREE.Material => {
      const cacheKey = `${mat}-${wallH}`
      if (builtWallMats.has(cacheKey)) return builtWallMats.get(cacheKey)!
      let m: THREE.Material
      if (this.viewMode !== 'layout') {
        const def = this.getTextureDef(mat)
        const tex = this.textureCache.get(mat)
        if (tex && def) {
          const t = tex.clone()
          t.wrapS = t.wrapT = THREE.RepeatWrapping
          t.repeat.set(CELL_SIZE / def.tileSize, wallH / def.tileSize)
          this.applyTextureTransform(t, def)
          t.needsUpdate = true
          m = new THREE.MeshStandardMaterial({ map: t })
        } else {
          const layoutColor = def?.layoutColor ?? FALLBACK_WALL_COLOR
          m = new THREE.MeshLambertMaterial({ color: layoutColor })
        }
      } else {
        const def = this.getTextureDef(mat)
        m = new THREE.MeshLambertMaterial({ color: def?.layoutColor ?? FALLBACK_WALL_COLOR })
      }
      builtWallMats.set(cacheKey, m)
      return m
    }

    for (const key of floorSet) {
      const [col, row] = key.split(',').map(Number)
      const mat   = cellWallMat.get(key) ?? wallMaterial
      const wallH = (cellCeilHeight.get(key) ?? levelCeilH) * WALL_HEIGHT_PER_UNIT

      // North edge: row - 1 not floor
      if (!floorSet.has(`${col},${row - 1}`)) {
        const geo  = new THREE.BoxGeometry(CELL_SIZE, wallH, WALL_DEPTH)
        const mesh = new THREE.Mesh(geo, getWallMat(mat, wallH))
        mesh.position.set((col + 0.5) * CELL_SIZE, wallH / 2, row * CELL_SIZE)
        this.wallGroup.add(mesh)
      }
      // South edge
      if (!floorSet.has(`${col},${row + 1}`)) {
        const geo  = new THREE.BoxGeometry(CELL_SIZE, wallH, WALL_DEPTH)
        const mesh = new THREE.Mesh(geo, getWallMat(mat, wallH))
        mesh.position.set((col + 0.5) * CELL_SIZE, wallH / 2, (row + 1) * CELL_SIZE)
        this.wallGroup.add(mesh)
      }
      // West edge
      if (!floorSet.has(`${col - 1},${row}`)) {
        const geo  = new THREE.BoxGeometry(WALL_DEPTH, wallH, CELL_SIZE)
        const mesh = new THREE.Mesh(geo, getWallMat(mat, wallH))
        mesh.position.set(col * CELL_SIZE, wallH / 2, (row + 0.5) * CELL_SIZE)
        this.wallGroup.add(mesh)
      }
      // East edge
      if (!floorSet.has(`${col + 1},${row}`)) {
        const geo  = new THREE.BoxGeometry(WALL_DEPTH, wallH, CELL_SIZE)
        const mesh = new THREE.Mesh(geo, getWallMat(mat, wallH))
        mesh.position.set((col + 1) * CELL_SIZE, wallH / 2, (row + 0.5) * CELL_SIZE)
        this.wallGroup.add(mesh)
      }
    }

    // ── Grid overlay ──
    const gc = new THREE.Color(this.gridSettings.color)
    const gridGeo = new THREE.PlaneGeometry(gridWidth * CELL_SIZE, gridHeight * CELL_SIZE)
    const gridMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite:  false,
      uniforms: {
        uGridSize:    { value: new THREE.Vector2(gridWidth, gridHeight) },
        uLineColor:   { value: new THREE.Vector3(gc.r, gc.g, gc.b) },
        uLineOpacity: { value: this.gridSettings.opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec2  uGridSize;
        uniform vec3  uLineColor;
        uniform float uLineOpacity;
        void main() {
          vec2 coord = vUv * uGridSize;
          vec2 grid  = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
          float line  = min(grid.x, grid.y);
          float alpha = (1.0 - smoothstep(0.0, 1.2, line)) * uLineOpacity;
          gl_FragColor = vec4(uLineColor, alpha);
        }
      `
    })
    this.gridMaterial = gridMat
    this.gridGroup.visible = this.gridSettings.visible
    const gridPlane = new THREE.Mesh(gridGeo, gridMat)
    gridPlane.rotation.x = -Math.PI / 2
    gridPlane.position.set(gridWidth * CELL_SIZE / 2, 0.01, gridHeight * CELL_SIZE / 2)
    this.gridGroup.add(gridPlane)

    // ── Object placements ──
    for (const placement of level.placements) {
      const def = this.catalog.find((d) => d.id === placement.definitionId)
      if (!def) continue
      if (def.kind === 'token') {
        this.renderToken(placement.x, placement.y, def as TokenDefinition, placement.id)
      } else {
        const rotation = placement.kind === 'prop' ? placement.rotation : 0
        this.renderProp(placement.x, placement.y, def.visual.naturalWidth, def.visual.naturalHeight, rotation, placement.id, def.id)
      }
    }

    // ── Room labels ──
    for (const room of level.rooms) {
      if (room.showLabel) this.renderRoomLabel(room)
    }

    // ── Player tokens ──
    for (const player of this.players) {
      if (player.placement?.levelId === level.id) {
        this.renderPlayerToken(player, 1.0, this.playersGroup, player.placement.x, player.placement.y)
      }
    }
  }

  /** Resolve a texture definition by ID, or null. */
  private getTextureDef(id: string): TextureDefinition | null {
    return this.textureCatalog.find((d) => d.id === id) ?? null
  }

  /** Resolve the layout color for a material ID (falls back to FALLBACK_FLOOR_COLOR). */
  private getLayoutColor(materialId: string): number {
    return this.getTextureDef(materialId)?.layoutColor ?? FALLBACK_FLOOR_COLOR
  }

  private renderRoomFloor(room: Room, defaults: SurfaceSettings, roomIndex: number, roomCount: number): void {
    const materialId = room.settings.floorMaterial ?? defaults.floorMaterial
    // Rooms earlier in the array (top of nav) get a more-negative polygon offset → closer to
    // camera → win Z-fights against rooms that are lower in the list.
    const zBias = -(roomCount - roomIndex)

    if (this.viewMode !== 'layout') {
      this.renderRoomFloorTextured(room, materialId, zBias)
    } else {
      this.renderRoomFloorLayout(room, materialId, zBias)
    }
  }

  private renderRoomFloorLayout(room: Room, materialId: string, zBias: number): void {
    const color = this.getLayoutColor(materialId)
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

    const mat = new THREE.MeshLambertMaterial({
      vertexColors:        true,
      polygonOffset:       true,
      polygonOffsetFactor: zBias,
      polygonOffsetUnits:  zBias,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.userData['roomId'] = room.id
    this.mapGroup.add(mesh)
  }

  private renderRoomFloorTextured(room: Room, materialId: string, zBias: number): void {
    const def = this.getTextureDef(materialId)
    const tex = def ? this.textureCache.get(def.id) : undefined

    if (!tex) {
      this.renderRoomFloorLayout(room, materialId, zBias)
      return
    }

    const tileSize = def.tileSize
    const w = room.width  * CELL_SIZE
    const h = room.height * CELL_SIZE

    const geo = new THREE.PlaneGeometry(w, h)
    geo.rotateX(-Math.PI / 2)

    const uvs = geo.attributes.uv
    const repeatU = w / tileSize
    const repeatV = h / tileSize
    for (let i = 0; i < uvs.count; i++) {
      uvs.setXY(i, uvs.getX(i) * repeatU, uvs.getY(i) * repeatV)
    }
    uvs.needsUpdate = true

    const roomTex = tex.clone()
    roomTex.wrapS = roomTex.wrapT = THREE.RepeatWrapping
    this.applyTextureTransform(roomTex, def)
    roomTex.needsUpdate = true

    const mat = new THREE.MeshStandardMaterial({
      map:                 roomTex,
      polygonOffset:       true,
      polygonOffsetFactor: zBias,
      polygonOffsetUnits:  zBias,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(
      (room.x + room.width  / 2) * CELL_SIZE,
      0,
      (room.y + room.height / 2) * CELL_SIZE
    )
    mesh.userData['roomId'] = room.id
    this.mapGroup.add(mesh)
  }

  /** Apply rotation and offset from a TextureDefinition to a cloned THREE.Texture. */
  private applyTextureTransform(tex: THREE.Texture, def: TextureDefinition): void {
    tex.rotation = (def.rotation * Math.PI) / 180
    tex.offset.set(def.offsetX, def.offsetY)
    tex.center.set(0.5, 0.5)  // rotate around center so repeat stays aligned
  }

  private renderRoomLabel(room: Room): void {
    const text   = room.label || room.name
    const CW     = 256
    const CH     = 40
    const oc     = document.createElement('canvas')
    oc.width     = CW
    oc.height    = CH
    const ctx    = oc.getContext('2d')!

    // Semi-transparent dark pill background
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.beginPath()
    ctx.roundRect(3, 3, CW - 6, CH - 6, 6)
    ctx.fill()

    // White label text
    ctx.fillStyle    = '#ffffff'
    ctx.font         = 'bold 17px sans-serif'
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, CW / 2, CH / 2, CW - 16)

    const tex   = new THREE.CanvasTexture(oc)
    const planeW = Math.min(room.width * 0.85, 3.5)
    const planeH = 0.45
    const geo   = new THREE.PlaneGeometry(planeW, planeH)
    geo.rotateX(-Math.PI / 2)
    const mesh  = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false
    }))
    const cx = (room.x + room.width  / 2 + room.labelOffset.x) * CELL_SIZE
    const cz = (room.y + room.height / 2 + room.labelOffset.y) * CELL_SIZE
    mesh.position.set(cx, 0.04, cz)
    mesh.renderOrder       = 5
    mesh.userData['labelRoomId'] = room.id
    this.labelsGroup.add(mesh)
  }

  /** Move a label sprite in real-time during drag (no command dispatched yet). */
  moveLabelPreview(roomId: string, offsetX: number, offsetY: number): void {
    const room = this.currentLevel?.rooms.find((r) => r.id === roomId)
    if (!room) return
    for (const child of this.labelsGroup.children) {
      if ((child as THREE.Mesh).userData['labelRoomId'] === roomId) {
        child.position.set(
          (room.x + room.width  / 2 + offsetX) * CELL_SIZE,
          0.04,
          (room.y + room.height / 2 + offsetY) * CELL_SIZE
        )
        break
      }
    }
  }

  /** Returns the room whose visible label is under (fx, fy) in grid coordinates. */
  // ── Player token rendering ────────────────────────────────────────────────────

  /** Store the project-level players list. Called whenever the project changes. */
  setPlayers(players: Player[]): void {
    this.players = players
  }

  /**
   * Render a square rounded-corner player token.
   * The mesh is placed at local origin so the group can be repositioned freely.
   * @param worldX  World X position in grid units (ignored when rendering into ghost group)
   * @param worldY  World Y position in grid units
   */
  private renderPlayerToken(
    player: Player, opacity: number, group: THREE.Group,
    worldX: number, worldY: number
  ): void {
    const SIZE = 128
    const SIDE = 0.88   // grid units

    const oc    = document.createElement('canvas')
    oc.width    = SIZE
    oc.height   = SIZE
    const ctx   = oc.getContext('2d')!
    const tex   = new THREE.CanvasTexture(oc)

    const drawCanvas = (img: HTMLImageElement | null) => {
      const r = SIZE * 0.1
      ctx.clearRect(0, 0, SIZE, SIZE)

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(0, 0, SIZE, SIZE, r)
      ctx.clip()

      if (img) {
        ctx.drawImage(img, 0, 0, SIZE, SIZE)
      } else {
        ctx.fillStyle = '#1a5c5c'
        ctx.fillRect(0, 0, SIZE, SIZE)
        const initials = player.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?'
        ctx.fillStyle = '#2dd4bf'
        ctx.font      = `bold ${SIZE * 0.38}px sans-serif`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(initials.toUpperCase(), SIZE / 2, SIZE / 2)
      }
      ctx.restore()

      const bw = SIZE * 0.06
      ctx.save()
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.85)'
      ctx.lineWidth   = bw
      ctx.beginPath()
      ctx.roundRect(bw / 2, bw / 2, SIZE - bw, SIZE - bw, r)
      ctx.stroke()
      ctx.restore()

      tex.needsUpdate = true
    }

    const geo = new THREE.PlaneGeometry(SIDE, SIDE)
    geo.rotateX(-Math.PI / 2)
    const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, depthTest: false })
    const mesh = new THREE.Mesh(geo, mat)
    // Mesh at local origin — the group carries the world position
    mesh.position.set(0, 0.025, 0)
    mesh.renderOrder = 11
    mesh.userData['playerId'] = player.id

    const tokenGroup = new THREE.Group()
    tokenGroup.position.set(worldX * CELL_SIZE, 0, worldY * CELL_SIZE)
    tokenGroup.add(mesh)
    group.add(tokenGroup)
    this.playerMeshMap.set(player.id, tokenGroup)

    if (player.portrait) {
      const img = new Image()
      img.onload = () => { drawCanvas(img) }
      img.onerror = () => drawCanvas(null)
      img.src = player.portrait
      drawCanvas(null)   // draw fallback immediately; portrait overwrites on load
    } else {
      drawCanvas(null)
    }
  }

  /** Move a player token during drag (no dispatch). Moves the token's sub-group and selection outline. */
  movePlayerPreview(playerId: string, fx: number, fy: number): void {
    const tokenGroup = this.playerMeshMap.get(playerId)
    if (!tokenGroup) return
    tokenGroup.position.set(fx * CELL_SIZE, 0, fy * CELL_SIZE)
    const outline = this.selectionGroup.getObjectByName('player_sel')
    if (outline) outline.position.set(fx * CELL_SIZE, 0.03, fy * CELL_SIZE)
  }

  /** AABB hit-test: returns the player token hit at float (fx, fy), or null. */
  hitPlayer(fx: number, fy: number): Player | null {
    const HALF = 0.44   // half of 0.88 grid units
    for (let i = this.players.length - 1; i >= 0; i--) {
      const player = this.players[i]
      if (!player.placement) continue
      if (player.placement.levelId !== this.currentLevel?.id) continue
      const dx = Math.abs(fx - player.placement.x)
      const dy = Math.abs(fy - player.placement.y)
      if (dx <= HALF && dy <= HALF) return player
    }
    return null
  }

  /** Build or rebuild the player placement ghost for the given player. */
  setPlayerGhost(player: Player | null): void {
    this.disposeGroup(this.playerGhostGroup)
    this.playerGhostGroup.visible = false
    if (!player) return
    // Render ghost at local origin (0,0) — movePlayerGhost repositions the group
    this.renderPlayerToken(player, 0.5, this.playerGhostGroup, 0, 0)
    // renderPlayerToken stores the sub-group in playerMeshMap; remove it so it doesn't interfere
    this.playerMeshMap.delete(player.id)
  }

  /** Reposition the player ghost. Called every mousemove in player_place mode. */
  movePlayerGhost(fx: number, fy: number): void {
    if (this.playerGhostGroup.children.length === 0) return
    this.playerGhostGroup.position.set(fx * CELL_SIZE, 0.03, fy * CELL_SIZE)
    this.playerGhostGroup.visible = true
  }

  /** Hide the player ghost without destroying it. */
  hidePlayerGhost(): void {
    this.playerGhostGroup.visible = false
  }

  /** Remove the player ghost entirely. */
  clearPlayerGhost(): void {
    this.disposeGroup(this.playerGhostGroup)
    this.playerGhostGroup.visible = false
  }

  /** Add a teal selection highlight around a player token. */
  setPlayerSelection(player: Player | null): void {
    // Remove any existing player selection highlight
    const existing = this.selectionGroup.getObjectByName('player_sel')
    if (existing) {
      this.selectionGroup.remove(existing)
      ;(existing as THREE.Mesh).geometry?.dispose()
    }
    if (!player?.placement) return
    const { x, y } = player.placement
    // Thick square ring matching the object token ring style
    const outer = 0.54   // half-extent of outer square
    const inner = 0.44   // half-extent of inner square (ring thickness = 0.10)
    const shape = new THREE.Shape()
    shape.moveTo(-outer, -outer)
    shape.lineTo( outer, -outer)
    shape.lineTo( outer,  outer)
    shape.lineTo(-outer,  outer)
    shape.lineTo(-outer, -outer)
    const hole = new THREE.Path()
    hole.moveTo(-inner, -inner)
    hole.lineTo( inner, -inner)
    hole.lineTo( inner,  inner)
    hole.lineTo(-inner,  inner)
    hole.lineTo(-inner, -inner)
    shape.holes.push(hole)
    const geo  = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    const mat  = new THREE.MeshBasicMaterial({ color: SELECTION_COLOR, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'player_sel'
    mesh.position.set(x * CELL_SIZE, 0.03, y * CELL_SIZE)
    mesh.renderOrder = 12
    this.selectionGroup.add(mesh)
  }

  hitLabel(fx: number, fy: number, level: Level): Room | null {
    for (let i = level.rooms.length - 1; i >= 0; i--) {
      const room = level.rooms[i]
      if (!room.showLabel) continue
      const lx = room.x + room.width  / 2 + room.labelOffset.x
      const ly = room.y + room.height / 2 + room.labelOffset.y
      const hw = Math.min(room.width * 0.85 / 2, 1.75)
      const hh = 0.3
      if (Math.abs(fx - lx) <= hw && Math.abs(fy - ly) <= hh) return room
    }
    return null
  }

  private renderToken(x: number, y: number, def: TokenDefinition, placementId: string): void {
    const { bgColor, fgColor, borderColor, iconContent } = def.visual
    const cx = x * CELL_SIZE
    const cz = y * CELL_SIZE

    // Border ring (flat color — no texture needed)
    const ringGeo = new THREE.RingGeometry(0.37, 0.43, 32)
    ringGeo.rotateX(-Math.PI / 2)
    const ringMesh = new THREE.Mesh(ringGeo,
      new THREE.MeshBasicMaterial({ color: borderColor, side: THREE.DoubleSide, depthTest: false }))
    ringMesh.position.set(cx, 0.02, cz)
    ringMesh.renderOrder = 6
    ringMesh.userData['placementId'] = placementId
    this.objectsGroup.add(ringMesh)

    // Background fill (flat color — no texture needed)
    const fillGeo = new THREE.CircleGeometry(0.37, 32)
    fillGeo.rotateX(-Math.PI / 2)
    const fillMesh = new THREE.Mesh(fillGeo,
      new THREE.MeshBasicMaterial({ color: bgColor, depthTest: false }))
    fillMesh.position.set(cx, 0.02, cz)
    fillMesh.renderOrder = 6
    fillMesh.userData['placementId'] = placementId
    this.objectsGroup.add(fillMesh)

    // SVG icon overlay — transparent canvas plane, loaded via blob URL (allowed by CSP)
    if (iconContent) {
      const SIZE = 128
      const oc   = document.createElement('canvas')
      oc.width   = SIZE
      oc.height  = SIZE
      const ctx  = oc.getContext('2d')!
      const tex  = new THREE.CanvasTexture(oc)

      const withDims = iconContent.replace('<svg ', '<svg width="24" height="24" ')
      const colored  = withDims.replace(/currentColor/g, fgColor)
      const blob     = new Blob([colored], { type: 'image/svg+xml' })
      const url      = URL.createObjectURL(blob)
      const img      = new Image()
      img.onload = () => {
        const pad = SIZE * 0.18
        ctx.drawImage(img, pad, pad, SIZE - pad * 2, SIZE - pad * 2)
        URL.revokeObjectURL(url)
        tex.needsUpdate = true
      }
      img.onerror = (e) => { URL.revokeObjectURL(url); console.warn('[MapRenderer] token icon load failed:', e) }
      img.src = url

      const iconGeo = new THREE.PlaneGeometry(0.62, 0.62)
      iconGeo.rotateX(-Math.PI / 2)
      const iconMesh = new THREE.Mesh(iconGeo,
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }))
      iconMesh.position.set(cx, 0.021, cz)
      iconMesh.renderOrder = 7
      iconMesh.userData['placementId'] = placementId
      this.objectsGroup.add(iconMesh)
    }
  }

  private renderProp(x: number, y: number, w: number, h: number, rotation: number, placementId: string, defId: string): void {
    const geo = new THREE.PlaneGeometry(w * CELL_SIZE * 0.9, h * CELL_SIZE * 0.9)
    geo.rotateX(-Math.PI / 2)
    geo.rotateY((rotation * Math.PI) / 180)

    const cachedTex = this.propTextureCache.get(defId)
    const mat = cachedTex
      ? new THREE.MeshBasicMaterial({ map: cachedTex, transparent: true, depthTest: false, alphaTest: 0.05 })
      : new THREE.MeshBasicMaterial({ color: 0x8b6914, transparent: true, opacity: 0.85, depthTest: false })

    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x * CELL_SIZE, 0.02, y * CELL_SIZE)
    mesh.renderOrder = 6
    mesh.userData['placementId'] = placementId
    this.objectsGroup.add(mesh)
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
    // Preserve the player selection outline — remove before disposeGroup so its geometry is not destroyed
    const playerSel = this.selectionGroup.getObjectByName('player_sel')
    if (playerSel) this.selectionGroup.remove(playerSel)
    this.disposeGroup(this.selectionGroup)
    if (playerSel) this.selectionGroup.add(playerSel)
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

    // ── Placement selection ──
    const placement = this.currentLevel.placements.find((p) => p.id === id)
    if (placement) {
      const def = this.catalog.find((d) => d.id === placement.definitionId)
      if (def?.kind === 'token') {
        // Bright ring around the token
        const ring = new THREE.RingGeometry(0.44, 0.54, 32)
        ring.rotateX(-Math.PI / 2)
        const mat  = new THREE.MeshBasicMaterial({ color: SELECTION_COLOR, transparent: true, opacity: 0.9, depthWrite: false })
        const mesh = new THREE.Mesh(ring, mat)
        mesh.position.set(placement.x * CELL_SIZE, 0.03, placement.y * CELL_SIZE)
        mesh.renderOrder = 10
        this.selectionGroup.add(mesh)
      } else if (def?.kind === 'prop') {
        // Wireframe bounding box
        const w = def.visual.naturalWidth  * CELL_SIZE * 0.9
        const h = def.visual.naturalHeight * CELL_SIZE * 0.9
        const boxGeo = new THREE.BoxGeometry(w, 0.05, h)
        const edges  = new THREE.EdgesGeometry(boxGeo)
        const mat    = new THREE.LineBasicMaterial({ color: SELECTION_COLOR, depthTest: false })
        const lines  = new THREE.LineSegments(edges, mat)
        const rot    = placement.kind === 'prop' ? (placement.rotation * Math.PI) / 180 : 0
        lines.rotation.y = rot
        lines.position.set(placement.x * CELL_SIZE, 0.03, placement.y * CELL_SIZE)
        lines.renderOrder = 10
        this.selectionGroup.add(lines)
        boxGeo.dispose()
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

        // Waypoint handles (orange, slightly smaller)
        const wpGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42)
        const wpMat = new THREE.MeshBasicMaterial({ color: WAYPOINT_COLOR, depthTest: false })
        for (const wp of hallway.waypoints) {
          const mesh = new THREE.Mesh(wpGeo, wpMat)
          mesh.position.set((wp.x + 0.5) * CELL_SIZE, 0.21, (wp.y + 0.5) * CELL_SIZE)
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

    const path = expandPath(
      computePath(roomA, roomB, hallway.waypoints, hallway.exitA, hallway.exitB),
      hallway.width
    )
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

  setGridSettings(visible: boolean, color: string, opacity: number): void {
    this.gridSettings = { visible, color, opacity }
    this.gridGroup.visible = visible
    if (this.gridMaterial) {
      const c = new THREE.Color(color)
      this.gridMaterial.uniforms['uLineColor'].value.set(c.r, c.g, c.b)
      this.gridMaterial.uniforms['uLineOpacity'].value = opacity
    }
  }

  setBackground(color: string): void {
    this.renderer.setClearColor(new THREE.Color(color))
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

  setObjectMovePreview(placementId: string, x: number, y: number): void {
    // Reposition ALL meshes belonging to this placement (tokens have ring + fill + icon)
    for (const child of this.objectsGroup.children) {
      if (child.userData['placementId'] === placementId) {
        child.position.x = x * CELL_SIZE
        child.position.z = y * CELL_SIZE
      }
    }

    // Keep the selection ring tracking too
    const ring = this.selectionGroup.children[0] as THREE.Mesh | undefined
    if (ring) ring.position.set(x * CELL_SIZE, 0.03, y * CELL_SIZE)
  }

  clearObjectMovePreview(): void {
    // Position is corrected by the subsequent loadLevel call triggered by dispatch
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
      const mat = existing.material as THREE.MeshLambertMaterial
      mat.emissive = new THREE.Color(HALLWAY_PREVIEW)
      mat.emissiveIntensity = 0.3
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
      if (mat.emissive) mat.emissive = new THREE.Color(0x000000)
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

  private fpsIsWalkable(wx: number, wz: number): boolean {
    const R = 0.25  // body radius in world units (= grid cells since CELL_SIZE=1)
    const probes = [
      { x: wx + R, z: wz     },
      { x: wx - R, z: wz     },
      { x: wx,     z: wz + R },
      { x: wx,     z: wz - R },
    ]
    for (const p of probes) {
      const col = Math.floor(p.x / CELL_SIZE)
      const row = Math.floor(p.z / CELL_SIZE)
      if (!this.fpsWalkable.has(`${col},${row}`)) return false
    }
    return true
  }

  private startLoop(): void {
    const FPS_SPEED = 6  // grid units per second
    let lastTime = performance.now()
    const animate = (): void => {
      this.animationId = requestAnimationFrame(animate)
      this.orbitControls?.update()

      if (this.fpsControls?.isLocked) {
        const now   = performance.now()
        const delta = (now - lastTime) / 1000
        lastTime    = now
        const dist  = FPS_SPEED * CELL_SIZE * delta

        const prevX = this.camera.position.x
        const prevZ = this.camera.position.z

        const moveX = this.fpsKeys.has('KeyD') || this.fpsKeys.has('ArrowRight') ? dist
                    : this.fpsKeys.has('KeyA') || this.fpsKeys.has('ArrowLeft')  ? -dist : 0
        const moveZ = this.fpsKeys.has('KeyW') || this.fpsKeys.has('ArrowUp')    ? dist
                    : this.fpsKeys.has('KeyS') || this.fpsKeys.has('ArrowDown')  ? -dist : 0

        // Try X axis
        if (moveZ !== 0) this.fpsControls.moveForward(moveZ)
        if (!this.fpsIsWalkable(this.camera.position.x, this.camera.position.z)) {
          this.camera.position.x = prevX
          this.camera.position.z = prevZ
        }

        const afterZX = this.camera.position.x
        const afterZZ = this.camera.position.z

        // Try strafe axis independently
        if (moveX !== 0) this.fpsControls.moveRight(moveX)
        if (!this.fpsIsWalkable(this.camera.position.x, this.camera.position.z)) {
          this.camera.position.x = afterZX
          this.camera.position.z = afterZZ
        }
      } else {
        lastTime = performance.now()
      }

      this.renderer.render(this.scene, this.camera)
    }
    animate()
  }

  // ── Placement ghost ──────────────────────────────────────────────────────────

  /** Build ghost meshes for the given definition. Hidden until movePlacementGhost is called. */
  setPlacementGhost(def: ObjectDefinition | null): void {
    this.disposeGroup(this.placementGhostGroup)
    this.placementGhostGroup.visible = false
    if (!def) return

    const OPACITY = 0.55
    if (def.kind === 'token') {
      const { bgColor, borderColor } = (def as TokenDefinition).visual
      const ringGeo = new THREE.RingGeometry(0.37, 0.43, 32)
      ringGeo.rotateX(-Math.PI / 2)
      this.placementGhostGroup.add(new THREE.Mesh(ringGeo,
        new THREE.MeshBasicMaterial({ color: borderColor, side: THREE.DoubleSide, transparent: true, opacity: OPACITY })))
      const fillGeo = new THREE.CircleGeometry(0.37, 32)
      fillGeo.rotateX(-Math.PI / 2)
      this.placementGhostGroup.add(new THREE.Mesh(fillGeo,
        new THREE.MeshBasicMaterial({ color: bgColor, transparent: true, opacity: OPACITY })))
    } else {
      const { naturalWidth, naturalHeight } = (def as PropDefinition).visual
      const geo = new THREE.PlaneGeometry(naturalWidth * CELL_SIZE * 0.9, naturalHeight * CELL_SIZE * 0.9)
      geo.rotateX(-Math.PI / 2)
      const cachedTex = this.propTextureCache.get(def.id)
      const mat = cachedTex
        ? new THREE.MeshBasicMaterial({ map: cachedTex, transparent: true, opacity: OPACITY, alphaTest: 0.05, depthTest: false })
        : new THREE.MeshBasicMaterial({ color: 0x8b6914, transparent: true, opacity: OPACITY })
      this.placementGhostGroup.add(new THREE.Mesh(geo, mat))
    }

    for (const child of this.placementGhostGroup.children) {
      (child as THREE.Mesh).renderOrder = 10
    }
  }

  /** Reposition the ghost and make it visible. Called on every mousemove when armed. */
  movePlacementGhost(fx: number, fy: number): void {
    if (this.placementGhostGroup.children.length === 0) return
    this.placementGhostGroup.position.set(fx * CELL_SIZE, 0.03, fy * CELL_SIZE)
    this.placementGhostGroup.visible = true
  }

  /** Hide the ghost without destroying it (e.g. when cursor leaves the canvas). */
  hidePlacementGhost(): void {
    this.placementGhostGroup.visible = false
  }

  /** Remove ghost meshes entirely (when tool changes or definition is cleared). */
  clearPlacementGhost(): void {
    this.disposeGroup(this.placementGhostGroup)
    this.placementGhostGroup.visible = false
  }

  dispose(): void {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId)
    this.orbitControls?.dispose()
    this.fpsControls?.dispose()
    if (this._onFpsKeydown) window.removeEventListener('keydown', this._onFpsKeydown)
    if (this._onFpsKeyup)   window.removeEventListener('keyup',   this._onFpsKeyup)
    if (this._onFpsClick)   this.canvas.removeEventListener('click', this._onFpsClick)
    this.disposeGroup(this.mapGroup)
    this.disposeGroup(this.wallGroup)
    this.disposeGroup(this.gridGroup)
    this.disposeGroup(this.objectsGroup)
    this.disposeGroup(this.selectionGroup)
    this.disposeGroup(this.hoverGroup)
    this.disposeGroup(this.playersGroup)
    this.disposeGroup(this.placementGhostGroup)
    this.disposeGroup(this.playerGhostGroup)
    this.renderer.dispose()
  }
}
