import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { CellType, Grid } from '../types/map'

export type ViewMode = 'topdown' | 'isometric' | 'fps'

const CELL_SIZE = 1
const WALL_HEIGHT = 1.5

const CELL_COLORS: Record<CellType, number> = {
  empty: 0x000000,       // not rendered
  floor: 0x4a3f35,
  wall: 0x6b6b6b,
  door: 0x8b4513,
  secret_door: 0x5a5a5a, // looks like wall intentionally
  stairs_up: 0x7b9eae,
  stairs_down: 0x4e7a8c,
  water: 0x1a6b8a,
  lava: 0xcc3300,
  pit: 0x0d0d0d,
  rubble: 0x5a5a4a,
  pillar: 0x888888
}

const WALL_TYPES = new Set<CellType>(['wall', 'pillar'])

export class MapRenderer {
  private canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.Camera
  private orbitControls: OrbitControls | null = null
  private fpsControls: PointerLockControls | null = null
  private animationId: number | null = null
  private mapGroup: THREE.Group | null = null
  private viewMode: ViewMode = 'topdown'
  private onCellInteract?: (x: number, y: number) => void
  private isPainting = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setClearColor(0x0d0d1a)

    this.scene = new THREE.Scene()
    this.camera = this.createTopDownCamera()

    this.setupLights()
    this.setupMouseHandlers()
    this.startLoop()
  }

  // ── Camera factories ──────────────────────────────────────────────────────

  private createTopDownCamera(cx = 24, cz = 24): THREE.OrthographicCamera {
    const aspect = this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1)
    const size = 24
    const cam = new THREE.OrthographicCamera(
      -size * aspect, size * aspect, size, -size, 0.1, 1000
    )
    cam.position.set(cx, 100, cz)
    cam.lookAt(cx, 0, cz)
    cam.up.set(0, 0, -1)
    return cam
  }

  private createIsometricCamera(gridWidth: number, gridHeight: number): THREE.OrthographicCamera {
    const aspect = this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1)
    const size = Math.max(gridWidth, gridHeight) * 0.75
    const cx = (gridWidth * CELL_SIZE) / 2
    const cz = (gridHeight * CELL_SIZE) / 2
    const cam = new THREE.OrthographicCamera(
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

  // ── Lights ────────────────────────────────────────────────────────────────

  private setupLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const dir = new THREE.DirectionalLight(0xfff5cc, 0.9)
    dir.position.set(10, 20, 10)
    this.scene.add(dir)
  }

  // ── Mouse interaction ─────────────────────────────────────────────────────

  private setupMouseHandlers(): void {
    const getCell = (e: MouseEvent): { x: number; y: number } | null => {
      if (this.viewMode === 'fps') return null
      const rect = this.canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, this.camera)
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const point = new THREE.Vector3()
      if (!raycaster.ray.intersectPlane(plane, point)) return null
      return { x: Math.floor(point.x / CELL_SIZE), y: Math.floor(point.z / CELL_SIZE) }
    }

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      this.isPainting = true
      const cell = getCell(e)
      if (cell) this.onCellInteract?.(cell.x, cell.y)
    })

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isPainting) return
      const cell = getCell(e)
      if (cell) this.onCellInteract?.(cell.x, cell.y)
    })

    this.canvas.addEventListener('mouseup', () => { this.isPainting = false })
    this.canvas.addEventListener('mouseleave', () => { this.isPainting = false })
  }

  setOnCellInteract(handler: (x: number, y: number) => void): void {
    this.onCellInteract = handler
  }

  // ── View mode ─────────────────────────────────────────────────────────────

  setViewMode(mode: ViewMode, gridWidth = 48, gridHeight = 48): void {
    this.viewMode = mode
    this.orbitControls?.dispose()
    this.fpsControls?.dispose()
    this.orbitControls = null
    this.fpsControls = null

    const cx = (gridWidth * CELL_SIZE) / 2
    const cz = (gridHeight * CELL_SIZE) / 2

    switch (mode) {
      case 'topdown': {
        this.camera = this.createTopDownCamera(cx, cz)
        this.orbitControls = new OrbitControls(this.camera, this.canvas)
        this.orbitControls.enableRotate = false
        // Right-click pans so left-click is free for painting
        this.orbitControls.mouseButtons = {
          LEFT: THREE.MOUSE.ROTATE,   // disabled; LEFT is reserved for paint
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN
        }
        break
      }
      case 'isometric': {
        this.camera = this.createIsometricCamera(gridWidth, gridHeight)
        this.orbitControls = new OrbitControls(this.camera, this.canvas)
        this.orbitControls.mouseButtons = {
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN
        }
        break
      }
      case 'fps': {
        this.camera = this.createFPSCamera()
        this.fpsControls = new PointerLockControls(this.camera, this.canvas)
        this.canvas.addEventListener('click', () => this.fpsControls?.lock(), { once: true })
        break
      }
    }
  }

  // ── Grid rendering ────────────────────────────────────────────────────────

  loadGrid(grid: Grid): void {
    if (this.mapGroup) {
      this.scene.remove(this.mapGroup)
      this.mapGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh
          mesh.geometry.dispose()
          const mat = mesh.material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else mat.dispose()
        }
      })
    }

    this.mapGroup = new THREE.Group()
    const { width, height, cells } = grid

    // ── Floor pass (vertex-colored BufferGeometry, one draw call) ──
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    let vi = 0

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const cell = cells[row][col]
        if (cell.type === 'empty') continue

        const hex = CELL_COLORS[cell.type] ?? CELL_COLORS.floor
        const r = ((hex >> 16) & 0xff) / 255
        const g = ((hex >> 8) & 0xff) / 255
        const b = (hex & 0xff) / 255

        const px = col * CELL_SIZE
        const pz = row * CELL_SIZE
        const base = vi

        positions.push(px, 0, pz)
        positions.push(px + CELL_SIZE, 0, pz)
        positions.push(px, 0, pz + CELL_SIZE)
        positions.push(px + CELL_SIZE, 0, pz + CELL_SIZE)

        for (let v = 0; v < 4; v++) colors.push(r, g, b)

        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
        vi += 4
      }
    }

    if (positions.length > 0) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      geo.setIndex(indices)
      geo.computeVertexNormals()
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
      this.mapGroup.add(new THREE.Mesh(geo, mat))
    }

    // ── Wall / pillar boxes ──
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const cell = cells[row][col]
        if (!WALL_TYPES.has(cell.type)) continue
        const geo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE)
        const mat = new THREE.MeshLambertMaterial({ color: CELL_COLORS[cell.type] })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(
          col * CELL_SIZE + CELL_SIZE / 2,
          WALL_HEIGHT / 2,
          row * CELL_SIZE + CELL_SIZE / 2
        )
        this.mapGroup.add(mesh)
      }
    }

    // ── Grid lines ──
    const linePos: number[] = []
    for (let x = 0; x <= width; x++) {
      linePos.push(x * CELL_SIZE, 0.005, 0, x * CELL_SIZE, 0.005, height * CELL_SIZE)
    }
    for (let z = 0; z <= height; z++) {
      linePos.push(0, 0.005, z * CELL_SIZE, width * CELL_SIZE, 0.005, z * CELL_SIZE)
    }
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3))
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2a2a40, transparent: true, opacity: 0.6 })
    this.mapGroup.add(new THREE.LineSegments(lineGeo, lineMat))

    this.scene.add(this.mapGroup)
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    const aspect = width / Math.max(height, 1)

    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = aspect
      this.camera.updateProjectionMatrix()
    } else if (this.camera instanceof THREE.OrthographicCamera) {
      const size = 24
      this.camera.left = -size * aspect
      this.camera.right = size * aspect
      this.camera.top = size
      this.camera.bottom = -size
      this.camera.updateProjectionMatrix()
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────

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
    this.renderer.dispose()
  }
}
